var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  uuid = require('uuid'),
  URI = require('uri'),
  config = require('config/config'),
  uriParamAppender = require('../../lib/uri-param-appender'),
  crypto = require('crypto'),
  cryptUtils = require('../../lib/crypt-utils'),
  sys = require('sys')

// The redirectUri below refers to the oauth proxy and not the client app
var clients = {
  '71746698906' :  {'name' : 'test',
                    'email' :'test@test.com',
                    'secret': '7609486090',
                    'password':'asa',
                    'redirectUri':'http://localhost:3031/'}
}

function main(app) {

  //
  // Authorize the user
  //
  app.resource('/authorize', {
    get: function(req, res) {
      // TODO: Support token and code_and_token. Why and when?
      var responseType = req.param('response_type') // code/token/code_and_token
      var clientId = req.param('client_id')

      // No redirectUri from the query - right now used only when there is an error
      // loading the client data
      var redirectUri = req.param('redirect_uri')

      // TODO
      var scope = req.param('scope')

      // Some opaque state that the client wants replayed
      var state = req.param('state')

      // 1. Load the client config by ID
      if(clients[clientId]) {
        // Found and retrieved the client - try to authorize the client
        // We need to first let the user login
        // Then show the permission screen to the user for the scopes

        // Redirect the user to the login server - after login, user goes to the consent page
        var loginUri = config.config.login.uri
        // Append state to the loginUri
        var loginState = {
          clientId: clientId,
          scope: scope,
          state: state,
          redirect_uri : req.param('redirect_uri'),
          expiry: new Date().getTime() + 300 // Expire after 5 minutes
        }
        loginState = JSON.stringify(loginState)
        var _state = cryptUtils.encryptThis(loginState, 'this is my secret')

        // Create the redirect URI
        var consent = uriParamAppender.appendParam(config.config.consentUri, {
          '.st' : _state
        })

        consent = encodeURIComponent(consent);

        // sign the uri
        var sign = cryptUtils.hmacThis(consent, 'this is my secret')
        loginUri = uriParamAppender.appendParam(loginUri, {
          '.rt' : consent,
          '.sign' : sign
        })

        res.writeHead(302, {
          'Location' : loginUri
        })
        res.end()
      }
      else {
        handleError({
          redirectUri: redirectUri,
          err: {
            message: sys.inspect(err)
          },
          clientId: clientId,
          res: res
        })
      }
    }
  })

  app.resource('/consent', {
    get: function(req, res) {
      // Get the state
      var _loginState = req.param('.st');
      var loginState = cryptUtils.decryptThis(_loginState, 'this is my secret')
      loginState = JSON.parse(loginState);

      // Get the user
      var userparam = req.param('user')
      var usersign = req.param('sign')
      if(!cryptUtils.verifyHmac(userparam, 'this is my secret', usersign)) {
        res.writeHead(400)
        res.end('Bad request - possibly tampered')
        return
      }

      var user = cryptUtils.decryptThis(userparam, 'this is my secret')

      // Mint a code - include client_id, scope, timestamp, and user identifier
      var codeObj = {
        'clientId' : loginState.clientId,
        'user' : user
      }
      if(loginState.scope) {
        codeObj.scope = loginState.scope
      }
      var baseStr = JSON.stringify(codeObj)
      var code = cryptUtils.encryptThis(baseStr, 'this is my secret')

      // Redirect back to the client
      var redirect_uri = decodeURIComponent(loginState.redirect_uri)

      redirect_uri = uriParamAppender.appendParam(redirect_uri, {
        'code' : code,
        'state' : loginState.state
      })
      res.writeHead(302, {
        'Location' : redirect_uri
      })
      res.end()
    }
  })

  app.resource('/token', {
    post: function(req, res) {
      var clientId = req.param('client_id')
      var clientSecret = req.param('client_secret')
      if(!clients[clientId] || clients[clientId].secret != clientSecret) {
        res.writeHead(403)
        res.end('Client auth failed. Mismatched secret')
        return
      }
      var grantType = req.param('grant_type')
      switch (grantType) {
        case 'authorization_code':
          var code = req.param('code')
          var baseStr = cryptUtils.decryptThis(code, 'this is my secret')
          refreshToken = cryptUtils.encryptThis(baseStr, 'this is my secret')
          break
        case 'refresh_token':
          var refreshToken = req.param('refresh_token')
          var baseStr = cryptUtils.decryptThis(refreshToken, 'this is my secret')
      }
      var codeObj = JSON.parse(baseStr)
      codeObj.clientSecret = req.param('client_secret')
      codeObj.timeStamp = new Date().getTime() // TODO: RFC 3339
      baseStr = JSON.stringify(codeObj)
      var accessToken = cryptUtils.encryptThis(baseStr, 'this is the token secret')

      // For now return dummy tokens
      var body = {
        'access_token' : accessToken,
        'token_type' : 'example',
        'expires_in' : 90,
        'refresh_token' : refreshToken
      }
      res.writeHead(200, {
        'Content-Type' : 'application/json'
      })
      res.end(JSON.stringify(body))
    }
  })
}

function handleError(obj) {
  if(obj.redirectUri) {
    var dest = uriParamAppender.appendParam(obj.redirectUri, {
      'error' : 'invalid_client',
      'error_description' : encodeURIComponent('Invalid client_id'),
      'state' : obj.state
    })
    obj.res.writeHead(302, {
      'Location': dest
    })
  }
}

var server = express.createServer()
server.use(express.bodyDecoder())
server.use(resource(main))
server.listen(4999)
console.log('Authorization server listening on port 4999')

// Run a pure proxy at 5000 - this will forward requests to port to localhost:6000
var http = require('http'),
  httpProxy = require('http-proxy')

http.createServer(function (req, res) {
  // Verify that the Authorization header is present
  var authorization = req.headers['authorization']
  if(!authorization) {
    res.writeHead(401, {'WWW-Authenticate' : 'OAuth2'})
    res.end('Missing WWW-Authenticate header')
    return
  }

  var splits = authorization.split(' ')
  if('OAuth2' != splits[0]) {
    res.writeHead(401, {'Content-Type' : 'text/plain'})
    res.end('Requires OAuth2')
    return
  }
  var accessToken = splits[1]
  var tokenObj
  try {
    var str = cryptUtils.decryptThis(accessToken, 'this is the token secret')
    tokenObj = JSON.parse(str)
  }
  catch(e) {
    sys.log('Invalid access token -' + sys.log(sys.inspect(e)))
    res.writeHead(401, {
      'WWW-Authenticate' : 'error="invalid_token",error_description="Invalid token'
    })
    res.end()
    return
  }
  if(new Date().getTime() >= tokenObj.timeStamp + 120) {
    // Expired
    sys.log('Access token expired')
    res.writeHead(401, {
      'WWW-Authenticate' : 'error="invalid_token",error_description="Token has expired'
    })
    res.end()
  }
  else {
    var proxy = new httpProxy.HttpProxy(req, res);
    proxy.proxyRequest(6000, 'localhost', req, res);
  }
}).listen(5000);