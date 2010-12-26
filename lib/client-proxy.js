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

//
// Uses redis to store OAuth credentials
//
redisClient.on("error", function (err) {
  console.log("Error " + err);
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
    res.writeHead(401, {'Proxy-Authenticate' : 'Basic realm="' + 'OAuth2 Authorization Server' + '"'})
    res.end('Missing Proxy-Authenticate header')
  }

  var splits = proxyAuthorization.split(' ')
  if('oauth2-proxy-assert' != splits[0]) {
    res.writeHead(401, {'Content-Type' : 'text/plain'})
    res.end('Requires oauth2-proxy-assert authentication')
  }
  var user = splits[1]

  // Key used to store/lookup OAuth2 credentials
  var key = 'oauth2:proxy:users:' + user

  proxyTheRequest(req, res, key)
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

//
//
// Support code
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
      // 'resourceUri' is where the client is sending the request to. We need to lookup the origin
      // config by the target URI
      var resourceUri = 'http://' + req.headers.host + req.url;
      var origin = originsConfig.findOrigin(resourceUri)
      if(!origin) {
        // Origin not configured - bail out
        res.writeHead(400)
        res.end('Can not dispatch requests to ' + resourceUri + '. Check the proxy configuration.')
      }
      else {
        //
        // Origin is setup - but no access token found for the current user. Start the OAuth dance.
        //
        sys.log('Starting the OAuth dance')

        // Encode the http://oauth.proxy.org/retry link.
        var links = req.headers.link ? req.headers.link.split() : []
        var retryUri;
        for(var i = 0, len = links.length; i < len; i++) {
          var link = headers.parse('Link', links[i])
          if(link.rel == 'http://oauth.proxy.org/retry') {
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

//
// Redirect server to complete the OAuth dance
//
var redirectServer = http.createServer(function(req, res) {
  var parsed = uri.parse(req.url, true)
  // Code
  var code = parsed.query['code']

  // State
  var state = parsed.query['state']
  state = cryptUtils.decryptThis(state, 'client-proxy-secret')
  state = JSON.parse(state)

  // Origin
  var origin = originsConfig.findOrigin(state.resourceUri)

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
