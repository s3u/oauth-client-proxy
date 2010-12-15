var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  sys = require('sys'),
  http = require('http'),
  client = require('../../utils/client'),
  querystring = require('querystring'),
  nstore = require('nstore');

function manageClients(app) {
  app.resource('/signup', {
    // Provide a UI for registering the client
    get: function(req, res) {
      res.render('signup/signup.ejs');
    }
  });

  app.resource('/oauth2', {
    get: function(req, res) {
      var code = req.param('code');

      // Get the access token
      var callback = 'http://localhost:3001/oauth2';
      callback = encodeURIComponent(callback);
      client.request({
        method: 'GET',
        uri: 'https://graph.facebook.com/oauth/access_token?client_id=124518964277647' +
          '&client_secret=5b2d54ed7332ce734b598ea515e0bd71' +
          '&redirect_uri=' + callback + '&code=' + code,
        clientError: function(clientRes) {
          res.render('signup/oauth2.ejs');
        },
        serverError: function(clientRes) {

        },
        success: function(clientRes) {
          clientRes.setEncoding('utf8');
          sys.log('success called');
          var data = '';
          clientRes.on('data', function(chunk) {
            data += chunk;
            sys.log('>>> chunk: ' + chunk);
          });
          clientRes.on('end', function() {
            sys.log('Access token response: ' + data);
            data = querystring.parse(data);
            sys.log('Access token response (JSON): ' + sys.inspect(data));

            var accessToken = data.access_token;

            // Get user info
            client.request({
              method: 'GET',
              uri: 'https://graph.facebook.com/me?access_token=' + accessToken,
              clientError: function(clientRes) {

              },
              serverError: function(clientRes) {

              },
              success: function(clientRes) {
                var data = '';
                clientRes.on('data', function(chunk) {
                  data += chunk;
                });
                clientRes.on('end', function() {
                  data = JSON.parse(data);

                  // Store the access token
                  var users = nstore.new ('data/users.db');
                  users.save(data.email, {
                    accessToken: accessToken,
                    firstName: data.first_name,
                    lastName: data.last_name
                  }, function(err, key) {
                    if (err) {
                      res.writeHead(500);
                    }
                    else {
                      sys.log(key);
                      res.render('signup/oauth2.ejs')
                    }
                  });

                })
              }
            });
          });
        }
      });

    }
  });

}

var server = express.createServer();
server.use(express.bodyDecoder());
server.use(resource(manageClients));
server.listen(3001);
console.log('Connect server listening on port 3001');
