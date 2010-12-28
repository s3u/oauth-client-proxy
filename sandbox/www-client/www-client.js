var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  sys = require('sys'),
  http = require('http'),
  client = require('../../js/lib/client'),
  querystring = require('querystring'),
  cryptUtils = require('../../js/lib/crypt-utils'),
  uri = require('url'),
  uriParmAppender = require('../../js/lib/uri-param-appender'),
  headers = require('headers')

function manageClients(app) {
  app.resource('/try', {
    // Provide a UI for registering the client
    get: function(req, res) {
      res.render('try.ejs')
    }
  })

  app.resource('/home', {
    // Render the start page
    get: function(req, res) {
      res.render('home.ejs')
    }
  })

  app.resource('/home/my', {
    get: function(req, res) {
      // Create a Proxy-Authorization header using the oauth2-proxy-assert scheme
      var authorization = 'proxy-assert ' + req.remoteUser
      // Encode the request URI to retry in case of failure
      var origUriLink = headers.format('Link', {
        href : 'http://localhost:4000/home/my',
        rel : ['oauth-proxy-continue']
      });

      // send the request
      client.request({
        method: 'GET',
        uri: 'http://localhost:5000/resource',
        proxy: 'http://localhost:3030',
        headers: {
          'Proxy-Authorization' : authorization,
          'Link' : origUriLink
        },
        clientError: function(clientRes) {
          sys.log("ERROR")
          res.end()
        },
        '401' : function(clientRes) {
          res.writeHead(401)
          res.end('Server says you are not authorized!')
        },
        '302' : function(clientRes) {
          // got redirected here since the user has not authorized me
          // here we should tell the user before redirectling bluntly

          // continueTo is where the user will be sent to for authorization - this is the location told by the proxy
          var continueTo = clientRes.headers.location

          // Render the user alert page
          res.render('authorize.ejs', {
            continueTo : encodeURIComponent(continueTo)
          })
          res.end()
        },
        success: function(clientRes) {
          var data = ''
          clientRes.on('data', function(chunk) {
            data += chunk
          })
          clientRes.on('end', function() {
            data = JSON.parse(data)
            res.render('home/my.ejs', data)
            res.end()
          })
        }
      })
    }
  })

  app.resource('/home/facebook', {
    get: function(req, res) {
      // Create a Proxy-Authorization header using the oauth2-proxy-assert scheme
      var authorization = 'proxy-assert ' + req.remoteUser
      // Encode the request URI to retry in case of failure
      var origUriLink = headers.format('Link', {
        href : 'http://localhost:4000/home/facebook',
        rel : ['http://oauth.proxy.org/retry']
      });

      // send the request
      client.request({
        method: 'GET',
        uri: 'https://graph.facebook.com:443/me',
        proxy: 'http://localhost:3030',
        headers: {
          'Proxy-Authorization' : authorization,
          'Link' : origUriLink
        },
        clientError: function(clientRes) {
          sys.log("ERROR")
          res.end()
        },
        '401' : function(clientRes) {
          res.writeHead(401)
          res.end('Server says you are not authorized!')
        },
        '302' : function(clientRes) {
          // got redirected here since the user has not authorized me
          // here we should tell the user before redirectling bluntly

          // continueTo is where the user will be sent to for authorization - this is the location told by the proxy
          var continueTo = clientRes.headers.location

          // Render the user alert page
          res.render('authorize.ejs', {
            continueTo : encodeURIComponent(continueTo)
          })
          res.end()
        },
        success: function(clientRes) {
          var data = ''
          clientRes.on('data', function(chunk) {
            data += chunk
          })
          clientRes.on('end', function() {
            data = JSON.parse(data)
            res.render('home/facebook.ejs', JSON.stringify(data))
            res.end()
          })
        }
      })
    }
  })

  app.resource('/authorize', {
    get: function(req, res) {
      res.writeHead(302, {
        'Location' : req.param('continueTo')
      })
      res.end();
    }
  })
}

var users = {
  'user0' : 'password',
  'user1' : 'password',
  'user2' : 'password'
}

var server = express.createServer()

// todo: use basic auth for now. switch to forms later.
server.use(connect.basicAuth(function(user, password){
  return users.hasOwnProperty(user) && users[user] == password
}))
server.use(express.bodyDecoder())
server.use(resource(manageClients))
server.listen(4000)
console.log('Client running on port 4000')
