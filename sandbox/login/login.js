var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  sys = require('sys'),
  cryptUtils = require('../../js/lib/crypt-utils'),
  uriParamAppender = require('../../js/lib/uri-param-appender')

var users = {
  'john' : {
    firstName: 'John',
    lastName: 'Doe',
    password: 'john.doe'
  },

  'jane' : {
    firstName: 'Jane',
    lastName: 'Doe',
    password: 'jane.doe'
  }
}

function loginServer(app) {
  app.resource('/login', {
    // Login page
    get: function(req, res) {
      // verify that the signature matches
      var returnTo = req.param('.rt')
      var sign = req.param('.sign')
      var doMatch = cryptUtils.verifyHmac(returnTo, 'this is my secret', sign)

      if (returnTo && sign && doMatch) {
        // Render login page
        res.render('login.ejs', {
          'message' : '',
          '_rt' : returnTo,
          '_sign' : sign
        })
      }
      else {
        res.writeHead(400)
        res.render('err.ejs', {
          message: 'You did something wrong. Don\'t retry!'
        })
      }
    },

    // Login
    post: function(req, res) {
      var returnTo = req.param('.rt')
      var sign = req.param('.sign')

      var userid = req.param('user')
      var password = req.param('password')

      if (!userid || !password) {
        res.render('login.ejs', {
          message: '',
          _rt: req.param('.rt'),
          _sign: req.param('.sign'),
          warning: 'Missing user ID or password'
        })
        return
      }
      // Verify again that the signature matches
      var doMatch = cryptUtils.verifyHmac(returnTo, 'this is my secret', sign)

      var userparam = cryptUtils.encryptThis(userid, 'this is my secret')
      var usersign = cryptUtils.hmacThis(userparam, 'this is my secret')

      // Append user id to the returnTo URI
      returnTo = decodeURIComponent(returnTo)
      returnTo = uriParamAppender.appendParam(returnTo, {
        'user' : userparam,
        'sign' : usersign
      })
      sys.log('returnTo (after login): ' + returnTo)
      if (returnTo && sign && doMatch) {
        var user = users[userid]
        if (user && password == user.password) {
          // Redirect
          res.writeHead(302, {
            'Location' : returnTo
          })
          res.end()
        }
        else {
          // Render login page
          res.render('login.ejs', {
            'message' : 'User ID and password do not match',
            '_rt' : req.param('.rt'),
            '_sign' : req.param('.sign')
          })
        }
      }
      else {
        res.writeHead(400)
        res.render('err.ejs', {
          message: 'You did something wrong. Don\'t retry!'
        })
      }
    }
  })
}

var server = express.createServer()
server.use(express.bodyDecoder())
server.use(resource(loginServer))
server.listen(4998)
console.log('Login server listening on port 4998')
