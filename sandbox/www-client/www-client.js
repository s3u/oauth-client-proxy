var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  sys = require('sys'),
  http = require('http'),
  client = require('../../lib/client'),
  querystring = require('querystring'),
  nstore = require('nstore'),
  cryptUtils = require('../../lib/crypt-utils')

function manageClients(app) {

  app.resource('/try', {
    // Provide a UI for registering the client
    get: function(req, res) {
      res.render('try.ejs')
    }
  })

  app.resource('/getsomedata', {

    get: function(req, res) {
      // Auth uri: http://localhost:4000/oauth/authorize?client_id=124518964277647&amp;scope=email
      // redirect uri:
      // resource uri: http://localhost:5000/resource

      // create a Proxy-Authorization header using my own aes256sha1
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
          res.writeHead(302, {
            'Location' : clientRes.headers.location
          })
          res.end();
        },
        success: function(clientRes) {
          sys.log("SUCCESS")
          var data = ''
          clientRes.on('data', function(chunk) {
            data += chunk
          })
          clientRes.on('end', function() {
            data = JSON.parse(data)
            res.render('gotsomedata.ejs', data)
            res.end()
          })
        }
      })
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
  sys.log(user + ' - ' + password)
  return users.hasOwnProperty(user) && users[user] == password
}))
server.use(express.bodyDecoder())
server.use(resource(manageClients))
server.listen(4000)
console.log('Client running on port 4000')
