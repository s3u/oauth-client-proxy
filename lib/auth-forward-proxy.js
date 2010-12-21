var sys = require('sys'),
  http = require('http'),
  client = require('../utils/client'),
  utils = require('../utils/utils');

var handler = function (req, res) {
  sys.log('>>> Got request ' + req.method);
  var host = req.headers['host'];
  if (!host) {
    return badRequest(res, 'Missing Host header');
  }
/*
  var proxyAuthorization = req.headers['Proxy-Authorization'];
  if (!proxyAuthorization) {
    return unauthorized(res);
  }

  var splits = proxyAuthorization.split(' ');
  if ('Basic' != splits[0]) {
    return unsupportedScheme();
  }

  var creds = new Buffer(splits[1], 'base64').toString().split(':');
  if (authorizedClients[creds[0]] && authorizedClients[creds[0]].secret == creds[1]) {
    // Authorized
    proxyTheRequest(req, res);
  }
  else {
    unathorized(res);
  }
  */
  proxyTheRequest(req, res);
}

http.createServer(handler).listen(3030);
sys.puts('Proxy running at http://localhost:3030');

// Some internal code
function unauthorized(res) {
  res.writeHead(401, {'Proxy-Authenticate' : 'Basic realm="' + 'OAuth2 Authorization Server' + '"'});
  res.end();
}

function unsupportedScheme(res, scheme) {
  res.writeHead(401, {'Content-Type' : 'text/plain'});
  res.end('Requires basic authentication');
}

function badRequest(res, message) {
  res.writeHead(400, {'Content-Type' : 'text/plain'});
  res.end('Bad request: ' + message);
}

function proxyTheRequest(req, res) {
  var header = req.headers['host'];
  var splits = header.split(':');
  var host = splits[0];
  var port = 5000;
  var uri = 'http://' + host + ':' + port + req.url;

  client.request({
    method: req.method,
    uri: uri,
    connectError: function(err) {
      res.writeHead(502);
      res.end();
    },
    response: function(clientRes) {
      res.writeHead(clientRes.statusCode, clientRes.headers);
      clientRes.on('data', function(chunk) {
        res.write(chunk);
      });
      clientRes.on('end', function() {
        res.end();
      })
    }
  });
}
