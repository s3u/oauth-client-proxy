var sys = require('sys'),
  http = require('http'),
  client = require('active-client'),
  utils = require('./uri-param-appender'),
  cryptUtils = require('./crypt-utils'),
  redis = require("redis"),
  uri = require('url'),
  headers = require('headers')

function OAuthProxy(opts) {
  if(opts['origins']) {
    this.origins = opts['options'];
  }
  else {
    sys.puts("No origins specified");
    this.origins = [];
  }

  if(opts['proxyAuth']) {
    this.proxyAuthFn = opts['proxyAuth'];
  }
  else {
    sys.log('using default auth fn');
    this.proxyAuthFn = function(req, res) {
      var proxyAuthorization = req.headers['proxy-authorization'];
      var splits = proxyAuthorization.split(' ');
      if('proxy-assert' != splits[0]) {
        res.writeHead(401, {'Content-Type' : 'text/plain'});
        res.end('Requires proxy-assert authentication');
      }
      return splits[1];
    };
    sys.log(this.proxyAuthFn);
  }

  this.redisClient = redis.createClient();
  this.redisClient.on('connect', function() {
    // client.auth('foobared')
    sys.puts('Connected to Redis')
  });
  this.redisClient.on('error', function() {
    sys.puts('Unable to connect to Redis');
  });

  var self = this;
  this.proxy = http.createServer(function (req, res) {
    var host = req.headers['host']
    if(!host) {
      res.writeHead(400, {'Content-Type' : 'text/plain'})
      res.end('Bad request: ' + message)
    }

    var proxyAuthorization = req.headers['proxy-authorization']
    if(!proxyAuthorization) {
      res.writeHead(401, {'Proxy-Authenticate' : 'proxy-assert realm="' + 'OAuth2 Authorization Server' + '"'})
      res.end()
    }

    self.proxyAuthFn(req, res);
    proxyTheRequest(self, req, res, req.user)
  });
  this.redirect = http.createServer(redirectHandler);
}

exports.OAuthProxy = OAuthProxy;

exports.createProxy = function(opts) {
  return new OAuthProxy(opts);
};

OAuthProxy.prototype.listen = function(proxyPort, redirectPort) {
  this.proxy.listen(proxyPort);
  this.redirect.listen(redirectPort);
}


//
// Use TLS for authentication
//
// TODO: TLS support evolving in node 0.3.2. Enable later.
// Path to credentials
//var path = '../demokeys/'; // This is the default
//process.argv.forEach(function (val, index, array) {
//  if(val.indexOf('demokeys=') == 0) {
//    var splits = val.split('=')
//    path = splits[1]
//    return
//  }
//})
// Load keys
//var privateKey = fs.readFileSync(path + 'privatekey.pem').toString();
//var certificate = fs.readFileSync(path + 'certificate.pem').toString();
//var credentials = crypto.createCredentials({key: privateKey, cert: certificate});
//server.setSecure(credentials)

//
// Support code
//
findOrigin = function(self, uri) {
  for(var i = 0, len = self.origins.length; i < len; i++) {
    var origin = self.origins[i]
    if(origin.pattern.test(uri)) {
      return origin
    }
  }
  return undefined
}

function proxyTheRequest(self, req, res, user) {

  // 'resourceUri' is where the client is sending the request to. We need to lookup the origin
  // config by the target URI
  var resourceUri = 'http://' + req.headers.host + req.url;
  var origin = findOrigin(self, resourceUri)
  if(!origin) {
    // Origin not configured - bail out
    res.writeHead(400)
    res.end('Can not dispatch requests to ' + resourceUri + '. Check the proxy configuration.')
    return
  }

  // Key used to store/lookup OAuth2 credentials
  var key = 'oauth2:proxy:users:' + origin.pattern + ':' + user

  this.redisClient.get(key, function(err, val) {
    if(err) {
      // unable to load user data due to some error
      res.writeHead(500)
      res.end('Internal error - ' + sys.inspect(err))
      return;
    }
    if(val) {
      // Found user's credentials
      var obj = JSON.parse(val)
      var target = 'http://' + req.headers.host + req.url;
      client.request({
        method: req.method,
        uri: target,
        headers : {
          'Authorization' : 'OAuth2 ' + obj.accessToken
        },
        connectError: function(err) {
          res.writeHead(502)
          res.end()
        },
        '401' : function(clientRes) { // Handle 401 for invalid and expired tokens
          // Renew the access token
          var body = ''
          body += 'grant_type=refresh_token'
          body += '&refresh_token=' + obj.refreshToken
          body += '&client_id=' + origin.clientId
          body += '&client_secret=' + origin.clientSecret

          // Exchange the code for an access token
          client.request({
            method: 'POST',
            uri: origin.tokenUri,
            body: body,
            headers: {
              'Content-Type' : 'application/x-www-form-urlencoded'
            },
            '4xx': function(clientRes) {
              sys.log("ERROR")
              res.writeHead(401, {
                'Authorization' : clientRes.headers['authorization']
              })
              res.end('Unable to get access token - ' + clientRes.headers['authorization'])
            },
            '2xx' : function(clientRes) {
              // access_token, refresh_token, expires_in
              var data = ''
              clientRes.on('data', function(chunk) {
                data += chunk
              })
              clientRes.on('end', function() {
                sys.log('got clientRes.ednd');
                var obj = JSON.parse(data)

                var creds = {
                  user : user,
                  originPattern : origin.pattern,
                  accessToken : obj.access_token,
                  refreshToken : obj.refresh_token,
                  expiresIn : obj.expires_in
                }

                // Store creds
                creds = JSON.stringify(creds)
                var key = 'oauth2:proxy:users:' + origin.pattern + ':' + user

                this.redisClient.set(key, creds) // TODO: Callback

                sys.log('Updated creds');

                // Now redo the request to the resource
                client.request({
                  method: req.method,
                  uri: target,
                  headers : {
                    'Authorization' : 'OAuth2 ' + obj.access_token
                  },
                  connectError: function(err) {
                    res.writeHead(502)
                    res.end()
                  },
                  '401' : function(clientRes) { // Handle 401 for invalid and expired tokens
                    sys.log('Unable to refresh the access token - clearing credentials and retrying')
                    // Clear the token and try again
                    this.redisClient.del(key, function(err, val) {
                      proxyTheRequest(req, res, user)
                    })
                  },
                  response: function(clientRes) {
                    res.writeHead(clientRes.statusCode, clientRes.headers)
                    clientRes.on('data', function(chunk) {
                      res.write(chunk)
                    })
                    clientRes.on('end', function() {
                      res.end()
                    })
                  }
                })
              })
            }
          })

        },
        response: function(clientRes) {
          res.writeHead(clientRes.statusCode, clientRes.headers)
          clientRes.on('data', function(chunk) {
            res.write(chunk)
          })
          clientRes.on('end', function() {
            res.end()
          })
        }
      })

    }
    else {
      //
      // User has not authorized yet - so send the user to the server's authorization uri
      //
      // 'resourceUri' is where the client is sending the request to. We need to lookup the origin
      // config by the target URI

      // Origin is setup - but no access token found for the current user. Start the OAuth dance.
      //
      sys.log('Starting the OAuth dance')

      // Encode the http://oauth.proxy.org/retry link.
      var links = req.headers.link ? req.headers.link.split() : []
      var retryUri;
      for(var i = 0, len = links.length; i < len; i++) {
        var link = headers.parse('Link', links[i])
        if(link.rel == 'oauth-proxy-continue') {
          retryUri = link.href
        }
      }
      if(!retryUri) {
        res.writeHead(400)
        res.end('Retry link not included in the request')
      }

      var redirectUri = encodeURIComponent('http://localhost:3031/redirect?retry=' + encodeURIComponent(retryUri))

      // Remember the current state of the request
      var state = {
        resourceUri : resourceUri,
        redirectUri : redirectUri,
        user: user
      }
      state = JSON.stringify(state)
      state = cryptUtils.encryptThis(state, 'client-proxy-secret')

      res.writeHead(302, {
        'Location' : origin.authorizeUri + '?client_id=' + origin.clientId + '&redirect_uri=' + redirectUri +
          '&state=' + state
      })
      res.end();
    }
  })
}


//
// Redirect server to complete the OAuth dance
//
// This port should be visible via port 80.
//
var redirectHandler = function(req, res) {
  var parsed = uri.parse(req.url, true)

  var code = parsed.query['code']
  var state = parsed.query['state']
  state = cryptUtils.decryptThis(state, 'client-proxy-secret')
  state = JSON.parse(state)

  var origin = findOrigin(state.resourceUri)

  // Prepare the tokenUri
  var body = ''
  body += 'grant_type=authorization_code'
  body += '&redirect_uri=' + state.redirectUri
  body += '&client_id=' + origin.clientId
  body += '&code=' + code
  body += '&client_secret=' + origin.clientSecret

  // Exchange the code for an access token
  client.request({
    method: 'POST',
    uri: origin.tokenUri,
    body: body,
    headers: {
      'Content-Type' : 'application/x-www-form-urlencoded'
    },
    '4xx' : function(clientRes) {
      sys.log("ERROR")
      res.writeHead(401, {
        'Authorization' : clientRes.headers['authorization']
      })
      res.end('Unable to get access token - ' + clientRes.headers['authorization'])
    },
    '2xx' : function(clientRes) {
      // access_token, refresh_token, expires_in
      var data = ''
      clientRes.on('data', function(chunk) {
        data += chunk
      })
      clientRes.on('end', function() {
        var obj = JSON.parse(data)

        // TODO: This won't work for multiple origins
        var creds = {
          user : state.user,
          originPattern : origin.pattern,
          accessToken : obj.access_token,
          refreshToken : obj.refresh_token,
          expiresIn : obj.expires_in
        }

        // Store creds
        creds = JSON.stringify(creds)
        var key = 'oauth2:proxy:users:' + origin.pattern + ':' + state.user

        this.redisClient.set(key, creds) // TODO: Callback

        // Redirect back to where we started
        var dest = parsed.query['retry']
        sys.log('End of dance - redirecting back to ' + dest)
        res.writeHead(302, {
          'Location' : dest
        })
        res.end()
        return
      })
    }
  })
}
