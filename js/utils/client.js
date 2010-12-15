var URI = require('uri'),
  http = require('http'),
  sys = require('sys'),
  crypto= require('crypto');

exports.request = function(obj) {
  sys.log('>>> Sending ' + obj.method + ' request to ' + obj.uri);

  var uri = new URI(obj.uri, false);
  var headers = obj.headers;

  var isTls = uri.scheme() == 'https:';
  var port = uri.heirpart().authority().port() || isTls ? 443 : 80;
  var host = uri.heirpart().authority().value;

  var client;
  if(isTls) {
    var creds = crypto.createCredentials({});
    client = http.createClient(port, host, isTls, creds);
  }
  else {
    client = http.createClient(port, host);
  }

  try {
    var request = client.request(obj.method, uri.heirpart().path().value + uri.querystring(),
    {'host': host});
    request.end();

    request.on('response', function (response) {
      response.setEncoding('utf8');
      sys.log('---------- response code: ' + response.statusCode);
      var handler = obj[response.statusCode];
      if (handler == undefined) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          handler = obj.success;
        }
        else if (response.statusCode >= 400 && response.statusCode < 500) {
          handler = obj.clientError;
        }
        else if (responseCode >= 500 && response.statusCode < 600) {
          handler = obj.serverError;
        }
        else if (obj.response) {
          handler = obj.response;
        }
      }

      if (handler && typeof handler == 'function') {
        handler(response);
      }
    });
  }
  catch(e) {
    sys.log(sys.inspect(e));
  }
};