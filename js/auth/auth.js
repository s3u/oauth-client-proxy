var connect = require('connect'),
  resource = require('resource-router'),
  express = require('express'),
  nstore = require('nstore'),
//  uuid = require('uuid.js'),
  sys = require('sys');

function manageClients(app) {
  app.resource('/register', {
    // Provide a UI for registering the client
    get: function(req, res) {
      res.render('register/register.ejs');
    },

    post: function(req, res) {
//      var u = new uuid.Uuid();
//      var id = u.random();
      // TODO: Temp
      var id = Math.floor(Math.random()*100000000000);
      var secret = Math.floor(Math.random()*100000000000);
      sys.log('>>> ' + req.rawBody);
      var name = req.body.name;
      var email = req.body.email;
      var password = req.body.password;

      var clients = nstore.new('data/clients.db');
      clients.save(id, {
        id: id,
        name: name,
        email: email,
        secret: secret,
        password: password
      }, function(err, key) {
        if(err) {
          res.writeHead(500);
        }
        else {
          sys.log(key);
          res.render('register/done.ejs', {
            key: key,
            secret: secret
          });
        }
        sys.log(key);
      });
    }
  });

  app.resource('/validateClient', {
    'get' : function(req, res) {
      // For now all requests are valid
      sys.log(sys.inspect(req.headers));
      var cookie = req.headers['cookie'];
      var authorization = req.header('authorization');

      // TODO: Validate
      res.writeHead(200, {"Content-Type": "text/plain"});
      res.end("OK");
    }
  });
}

var server = express.createServer();
server.use(express.bodyDecoder());
server.use(resource(manageClients));
server.listen(3000);
console.log('Connect server listening on port 3000');
