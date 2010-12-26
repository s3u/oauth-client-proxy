var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  nstore = require('nstore'),
  uuid = require('uuid'),
  URI = require('uri'),
  config = require('config/config'),
  uriParamAppender = require('../../lib/uri-param-appender'),
  crypto = require('crypto'),
  cryptUtils = require('../../lib/crypt-utils'),
  sys = require('sys')

var authorizedClients = {
  'user0' : 'password',
  'user1' : 'password',
  'user2' : 'password'
}

// The redirectUri below refers to the oauth proxy and not the client app
var clients = {
  '71746698906' :  {"name":"test","email":"test@test.com","secret":7609486090,"password":"asa","redirectUri":"http://localhost:3031/"}
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

        //
        // - Redirect the user to the login server
        //
        var loginUri = config.config.login.uri
        // Append state to the loginUri
        var loginState = {
          clientId: clientId,
          scope: scope,
          state: state,
          redirect_uri : req.param('redirect_uri'),
          expiry: new Date().getTime() + 300 // Expire after 5 minutes
        }
        sys.log('....... ' + req.param('redirect_uri'))

        loginState = JSON.stringify(loginState)

        // Encrypt the loginState
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
      // get the state
      var _loginState = req.param('.st');

      var loginState = cryptUtils.decryptThis(_loginState, 'this is my secret')
      loginState = JSON.parse(loginState);

      // TODO: Need to get params passed from /authorize to here via the login server
      // also need to know the redirect URI

      // Mint a code
      var code = Math.round(Math.random(10) * Math.pow(10, 10)) // TODO: Better code

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
      // TODO

      // For now return dummy tokens
      var body = {
        "access_token":"SlAV32hkKG",
        "token_type":"example",
        "expires_in":3600,
        "refresh_token":"8xLOxBtZp8"
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
  sys.log('accessToken: ' + accessToken)

  // TODO: Validate the accessToken

  var proxy = new httpProxy.HttpProxy(req, res);
  proxy.proxyRequest(6000, 'localhost', req, res);
}).listen(5000);