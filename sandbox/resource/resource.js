var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  crypto = require('crypto'),
  fs = require('fs'),
  sys = require('sys');

function resourceServer(app) {

  app.resource('/resource', {
    // Provide a UI for registering the client
    get: function(req, res) {
      // TODO: Check the authorization header

      var resource = {
        name: 'Subbu',
        text: 'Hi there'
      };
      res.writeHead(200, {
        'Content-Type' : 'application/json',
        'Connection' : 'close'
      });
      res.end(JSON.stringify(resource));
    }
  });
}


//var privateKey = fs.readFileSync('privatekey.pem').toString();
//var certificate = fs.readFileSync('certificate.pem').toString();
//var credentials = crypto.createCredentials({key: privateKey, cert: certificate});

var server = express.createServer();
//server.setSecure(credentials);
server.use(express.bodyDecoder());
server.use(resource(resourceServer));
server.listen(5000);
console.log('Resource server running on port 5000');

