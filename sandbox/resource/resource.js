var connect = require('connect'),
    resource = require('resource-router'),
    express = require('express'),
    crypto = require('crypto'),
    fs = require('fs'),
    sys = require('sys'),
    https = require('https');


var options = {
  key: fs.readFileSync('keys/s3u-key.pem'),
  cert: fs.readFileSync('keys/s3u-cert.pem')
};

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


var server = connect.createServer(options);
server.use(connect.bodyParser());
server.use(resource(resourceServer));
server.listen(6000);
console.log('Resource server running on port 6000');
