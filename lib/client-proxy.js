var sys = require('sys'),
  http = require('http'),
  client = require('client'),
  utils = require('uri-param-appender'),
  cryptUtils = require('crypt-utils'),
  originsConfig = require('../sandbox/data/origins-config'),
  redis = require("redis"),
  uri = require('url'),
  headers = require('headers'),
  redisClient = redis.createClient()

redisClient.on("error", function (err) {
  console.log("Error " + err);
});

// TODO: Move elsewhere - test data
var authorizedUsers = ['user0', 'user1', 'user2'];

var handler = function (req, res) {
  sys.log('>>> Got request ' + req.method + ' for ' + req.url)
  if(req.url.indexOf('/redirect') == 0) {
    var parsed = uri.parse(req.url, true)
    // Code
    var code = parsed.query['code']

    // State
    var state = parsed.query['state']
    state = cryptUtils.decryptThis(state, 'client-proxy-secret')
    state = JSON.parse(state)

    // Origin
    var origin = originsConfig.findOrigin(state.target)

    // Prepare the tokenUri
    // TODO: Current draft requires that redirect_uri is required for this request. But WHY?
    var body = ''
    body += 'grant_type=authorization_code&'
    body += 'code=' + code

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
        res.end()
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
          redisClient.set(state.user, creds) // TODO: Callback

          // Redirect back to where we started
          var dest = parsed.query['orig']
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
  else {
    var host = req.headers['host']
    if(!host) {
      return badRequest(res, 'Missing Host header')
    }

    var proxyAuthorization = req.headers['proxy-authorization']
    if(!proxyAuthorization) {
      return unauthorized(res)
    }

    var splits = proxyAuthorization.split(' ')
    if('aes256sha1' != splits[0]) {
      return unsupportedScheme(res)
    }

    var creds = splits[1].split(':')

    // verify the signature
    if(!cryptUtils.verifyHmac(creds[0], 'this is a secret', creds[1])) {
      return unauthorized(res)
    }

    // get the user
    var user = cryptUtils.decryptThis(creds[0], 'this is a secret')
    var found = false;
    for(var i = 0; i < authorizedUsers.length; i++) {
      if(user == authorizedUsers[i]) {
        found = true;
        break;
      }
    }
    if(!found) {
      return unauthorized(res)
    }
    else {
      // authorized - now look for an access token
      proxyTheRequest(req, res, user)
    }
  }
}

http.createServer(handler).listen(3030)
sys.puts('Proxy running at http://localhost:3030')

//
//
// Support code
function unauthorized(res) {
  res.writeHead(401, {'Proxy-Authenticate' : 'Basic realm="' + 'OAuth2 Authorization Server' + '"'})
  res.end()
}

function unsupportedScheme(res) {
  res.writeHead(401, {'Content-Type' : 'text/plain'})
  res.end('Requires aes256sha1 authentication')
}

function badRequest(res, message) {
  res.writeHead(400, {'Content-Type' : 'text/plain'})
  res.end('Bad request: ' + message)
}

function proxyTheRequest(req, res, user) {
  redisClient.get(user, function(err, val) {
    if(err) {
      // unable to load user data due to some error
      res.writeHead(500)
      res.end('Internal error - ' + sys.inspect(err))
      return;
    }
    if(val) {
      // Found user's data
      var obj = JSON.parse(val)
      proxyTheRequest0(req, res, obj.accessToken)
    }
    else {
      //
      // User has not authorized yet - so send the user to the server's authorization uri
      //
      // 'target' is where the client is sending the request to. We need to lookup the service
      // config by the target URI
      var target = 'http://' + req.headers.host + req.url;
      var origin = originsConfig.findOrigin(target)
      if(!origin) {
        // Origin not configured - bail out
        res.writeHead(400)
        res.end('Origin ' + target + ' not recognized by this proxy. Check the configuration.')
      }
      else {
        //
        // Origin is setup - but no access token found for the current user. Start the OAuth dance.
        //
        sys.log('Starting the OAuth dance')

        // Encode the http://oauth.proxy.org/retry link
        var links = req.headers.link ? req.headers.link.split() : []
        var origUri;
        for(var i = 0, len = links.length; i < len; i++) {
          var link = headers.parse('Link', links[i])
          if(link.rel == 'http://oauth.proxy.org/retry') {
            origUri = link.href
          }
        }
        if(!origUri) {
          res.writeHead(400)
          res.end('Retry link not included in the request')
        }

        var redirectUri = encodeURIComponent('http://localhost:3030/redirect?orig=' + encodeURIComponent(origUri))

        // Remember the current state of the request
        var state = {
          target: target,
          user: user
        }
        state = JSON.stringify(state)
        state = cryptUtils.encryptThis(state, 'client-proxy-secret')

        // Note that the 'redirectUri' is a template. The client MUST fill 'orig_uri' before letting the user
        // follow the 302.
        res.writeHead(302, {
          'Location' : origin.authorizeUri + '?client_id=' + origin.clientId + '&redirect_uri=' + redirectUri +
            '&state=' + state
        })
        res.end();
      }

    }
  })
}

function proxyTheRequest0(req, res, accessToken) {
  var target = 'http://' + req.headers.host + req.url;
  client.request({
    method: req.method,
    uri: target,
    headers : {
      'Authorization' : 'OAuth2 ' + accessToken
    },
    connectError: function(err) {
      res.writeHead(502)
      res.end()
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
