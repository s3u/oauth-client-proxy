var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  sys = require('sys'),
  http = require('http'),
  client = require('../../lib/client'),
  querystring = require('querystring'),
  nstore = require('nstore');

//
// This needs to be launched via proxychains
//
function manageClients(app) {

  app.resource('/try', {
    // Provide a UI for registering the client
    get: function(req, res) {
      res.render('try.ejs');
    }
  });

  app.resource('/getsomedata', {

    get: function(req, res) {
      // Auth uri: http://localhost:4000/oauth/authorize?client_id=124518964277647&amp;scope=email
      // redirect uri:
      // resource uri: http://localhost:5000/resource

      client.request({
        method: 'GET',
        uri: 'http://localhost:5000/resource',
        proxy: 'http://localhost:3030',
        clientError: function(clientRes) {
          sys.log("ERROR");
        },
        success: function(clientRes) {
          sys.log("SUCCESS");
          var data = '';
          clientRes.on('data', function(chunk) {
            data += chunk;
          });
          clientRes.on('end', function() {
            data = JSON.parse(data);
            res.render('gotsomedata.ejs', data);
            res.end();
          })
        }
      });
    }

  });
}

var server = express.createServer();
server.use(express.bodyDecoder());
server.use(resource(manageClients));
server.listen(4000);
console.log('Client running on port 4000');
