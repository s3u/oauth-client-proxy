var sys = require('sys'),
  http = require('http'),
  client = require('client'),
  utils = require('uri-param-appender'),
  cryptUtils = require('crypt-utils'),
  originsConfig = require('../../sandbox/data/origins-config'),
  redis = require("redis"),
  uri = require('url'),
  headers = require('headers')

var redisClient = redis.createClient()
redisClient.on('connect', function() {
  // client.auth('foobared')
  sys.puts('Connected to Redis')
})

//
// Uses redis to store OAuth credentials
//
redisClient.on("error", function (err) {
  console.puts("Redis error " + err);
});

//
// Main proxy server
//
var handler = function (req, res) {
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

  var splits = proxyAuthorization.split(' ')
  if('proxy-assert' != splits[0]) {
    res.writeHead(401, {'Content-Type' : 'text/plain'})
    res.end('Requires proxy-assert authentication')
  }
  var user = splits[1]

  proxyTheRequest(req, res, user)
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

var server = http.createServer(handler)
//server.setSecure(credentials)
server.listen(3030)
sys.puts('Proxy running at http://localhost:3030')

// Support code
function proxyTheRequest(req, res, user) {

  // 'resourceUri' is where the client is sending the request to. We need to lookup the origin
  // config by the target URI
  var resourceUri = 'http://' + req.headers.host + req.url;
  var origin = originsConfig.findOrigin(resourceUri)
  if(!origin) {
    // Origin not configured - bail out
    res.writeHead(400)
    res.end('Can not dispatch requests to ' + resourceUri + '. Check the proxy configuration.')
    return
  }

  // Key used to store/lookup OAuth2 credentials
  var key = 'oauth2:proxy:users:' + origin.pattern + ':' + user

  redisClient.get(key, function(err, val) {
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
            clientError: function(clientRes) {
              sys.log("ERROR")
              res.writeHead(401, {
                'Authorization' : clientRes.headers['authorization']
              })
              res.end('Unable to get access token - ' + clientRes.headers['authorization'])
            },
            success: function(clientRes) {
              // access_token, refresh_token, expires_in
              var data = ''
              clientRes.on('data', function(chunk) {
                data += chunk
              })
              clientRes.on('end', function() {
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

                redisClient.set(key, creds) // TODO: Callback

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
                    redisClient.del(key, function(err, val) {
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

function proxyTheRequest0(req, res, accessToken) {
}

//
// Redirect server to complete the OAuth dance
//
var redirectServer = http.createServer(function(req, res) {
  var parsed = uri.parse(req.url, true)

  var code = parsed.query['code']
  var state = parsed.query['state']
  state = cryptUtils.decryptThis(state, 'client-proxy-secret')
  state = JSON.parse(state)

  var origin = originsConfig.findOrigin(state.resourceUri)

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
    clientError: function(clientRes) {
      sys.log("ERROR")
      res.writeHead(401, {
        'Authorization' : clientRes.headers['authorization']
      })
      res.end('Unable to get access token - ' + clientRes.headers['authorization'])
    },
    success: function(clientRes) {
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

        redisClient.set(key, creds) // TODO: Callback

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
})
redirectServer.listen(3031)
sys.puts('Redirect server running at http://localhost:3031')
