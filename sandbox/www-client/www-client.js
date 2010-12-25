var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  sys = require('sys'),
  http = require('http'),
  client = require('../../lib/client'),
  querystring = require('querystring'),
  nstore = require('nstore'),
  cryptUtils = require('../../lib/crypt-utils'),
  uri = require('url'),
  uriParmAppender = require('../../lib/uri-param-appender')

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
      // Auth uri: http://localhost:4000/oauth/authorize?client_id=124518964277647&amp;scope=email
      // redirect uri:
      // resource uri: http://localhost:5000/resource

      // Create a Proxy-Authorization header using my own aes256sha1
      var data = req.remoteUser // came from basicAuth module
      var encrypted = cryptUtils.encryptThis(data, 'this is a secret')
      var hmac = cryptUtils.hmacThis(encrypted, 'this is a secret')
      var authorization = 'aes256sha1 ' + encrypted + ':' + hmac

      // send the request
      client.request({
        method: 'GET',
        uri: 'http://localhost:5000/resource',
        proxy: 'http://localhost:3030',
        headers: {
          'Proxy-Authorization' : authorization
        },
        clientError: function(clientRes) {
          sys.log("ERROR")
          res.end()
        },
        '302' : function(clientRes) {
          // got redirected here since the user has not authorized me
          // here we should tell the user before redirectling bluntly

          // continueTo is where the user will be sent to for authorization - this is the location told by the proxy
          var continueTo = clientRes.headers.location

          // Replace orig_uri in the redirect_uri parameter - since it is param, we need to encode the token
          // this is the URI that we want to retry after authorization
          var orig = encodeURIComponent('http://localhost:4000/home/my')
          continueTo = continueTo.replace(encodeURIComponent('{orig_uri}'), orig)

          // Encode since this value will be used in a link
          continueTo = encodeURIComponent(continueTo)

          // Render the user alert page
          res.render('authorize.ejs', {
            continueTo : continueTo
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
