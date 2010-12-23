var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  nstore = require('nstore'),
  uuid = require('uuid'),
  URI = require('uri'),
  config = require('config/config'),
  utils = require('../../lib/uri-param-appender'),
  crypto = require('crypto'),
  cryptUtils = require('../../lib/crypt-utils'),
  sys = require('sys')

var authorizedClients = {
  'user0' : 'password',
  'user1' : 'password',
  'user2' : 'password'
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
      var clients = nstore.new('../data/clients.db',function() {
        clients.get(clientId, function (err, doc, key) {
          if (err) {
            handleError({
              redirectUri: redirectUri,
              err: {
                message: sys.inspect(err)
              },
              clientId: clientId,
              res: res
            })
          }
          else {
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
              expiry: new Date().getTime() + 300 // Expire after 5 minutes
            }
            loginState = JSON.stringify(loginState)

            sys.log('loginState: ' + loginState)

            // Encrypt the loginState
            var _state = cryptUtils.encryptThis(loginState, 'this is my secret')
            sys.log('_state: ' + _state)

            // Create the redirect URI
            var consent = utils.appendParam(config.config.consentUri, {
              '.st' : _state
            })

            consent = encodeURIComponent(consent);
            sys.log('redirectUri: ' + consent)

            // sign the uri
            var sign = cryptUtils.hmacThis(consent, 'this is my secret')
            sys.log('sign: ' + sign);
            loginUri = utils.appendParam(loginUri, {
              '.rt' : consent,
              '.sign' : sign
            })

            sys.log('sending the user to - ' + loginUri)
            res.writeHead(302, {
              'Location' : loginUri
            })
            res.end()
          }
        })
      })
    }
  })

  app.resource('/consent', {
    get: function(req, res) {
      // get the state
      var _loginState = req.param('.st');
      sys.log('_loginState: ' + _loginState);

      var decipher = crypto.createDecipher('aes256', 'this is my secret')
      decipher.update(_loginState, 'base64', 'utf8')
      loginState = decipher.final('utf8')

//      var loginState = cryptUtils.decryptThis(_loginState, 'this is my secret');
      sys.log('loginState: ' + loginState);
      loginState = JSON.parse(loginState);

      // TODO: Need to get params passed from /authorize to here via the login server
      // also need to know the redirect URI

      // Mint a code
      var code = Math.round(Math.random(10) * Math.pow(10, 10)) // TODO: Better code




      // Redirect back to the client


    }
  })
}

function handleError(obj) {
  if (obj.err.errno == process.ENOENT) {
    // Redirect the client to the input redirect_uri
    if (obj.redirectUri) {
      var dest = utils.appendParam(obj.redirectUri, {
        'error' : 'invalid_client',
        'error_description' : encodeURIComponent('Invalid client_id'),
        'state' : obj.state
      })
      obj.res.writeHead(302, {
        'Location': dest
      })
    }
    else {
      obj.res.writeHead(400)
      obj.res.render('authorize/error.ejs', {
        error: 'invalid_client',
        message: 'No such client'
      })
    }
  }
  else {
    // Some other error
    obj.res.writeHead(500)
    obj.res.render('authorize/error.ejs', {
      error: sys.inspect(obj.err),
      message: 'Internal server error'
    })
  }

}

var server = express.createServer()
server.use(express.bodyDecoder())
server.use(resource(main))
server.listen(4998)
console.log('Authorization server listening on port 4998')
