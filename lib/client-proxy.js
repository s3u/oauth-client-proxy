var sys = require('sys'),
  http = require('http'),
  client = require('client'),
  utils = require('uri-param-appender'),
  cryptUtils = require('crypt-utils'),
  nstore = require('nstore'),
  originsConfig = require('../sandbox/data/origins-config')

var authorizedUsers = ['user0', 'user1', 'user2'];

var handler = function (req, res) {
  sys.log('>>> Got request ' + req.method)
  var host = req.headers['host']
  if (!host) {
    return badRequest(res, 'Missing Host header')
  }

  var proxyAuthorization = req.headers['proxy-authorization']
  if (!proxyAuthorization) {
    sys.log('missing proxy-authorization')
    return unauthorized(res)
  }

  var splits = proxyAuthorization.split(' ')
  if ('aes256sha1' != splits[0]) {
    return unsupportedScheme(res)
  }

  var creds = splits[1].split(':')

  // verify the signature
  if (!cryptUtils.verifyHmac(creds[0], 'this is a secret', creds[1])) {
    sys.log('signature did not match')
    return unauthorized(res)
  }

  // get the user
  var user = cryptUtils.decryptThis(creds[0], 'this is a secret')
  var found = false;
  for (var i = 0; i < authorizedUsers.length; i++) {
    if (user == authorizedUsers[i]) {
      found = true;
      break;
    }
  }
  if (!found) {
    sys.log('user not found')
    return unauthorized(res)
  }
  else {
    // authorized - now look for an access token
    proxyTheRequest(req, res, user)
  }
}

http.createServer(handler).listen(3030)
sys.puts('Proxy running at http://localhost:3030')

//
//
// Some internal code
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
  var clients = nstore.new('../sandbox/data/access-tokens.db', function() {
    clients.get(user, function (err, doc, key) {
      if (err) {
        if (err.errno == process.ENOENT) {
          // user has not authorized yet - so send the user to the server's authorization uri
          var target = 'http://' + req.headers.host + req.url;
          var origin = originsConfig.findOrigin(target)
          if (!origin) {
            // origin configured - bail out
            res.writeHead(400)
            res.end('Origin not setup - ' + target)
          }
          else {
            //
            // origin setup - but no access token found - start the dance
            //
            sys.log('orign setup - but no access token found - need to start the dance')
            sys.log('redirect the user to the authorization uri')
            res.writeHead(302, {
              'Location' : origin.authorizeUri + '?client_id=' + origin.clientId
            })
            res.end();
          }
        }
        else {
          // unable to load the due to some error
          res.writeHead(500)
          res.end('Internal error - ' + sys.inspect(err))
        }
      }
      else {
        // found the access token

      }
    });
  });

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
