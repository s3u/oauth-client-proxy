
var origins = [
  {
    pattern : /^http\:\/\/localhost\:5000\/resource/,
    authorizeUri : 'http://localhost:4999/authorize',
    tokenUri : 'http://localhost:4999/token',
    clientId : '71746698906',
    clientSecret: '7609486090'
  },
  {
    pattern : /^https\:\/\/graph.facebook.com\:443/,
    authorizeUri : 'http://graph.facebook.com/oauth/authorize',
    tokenUri : 'https://graph.facebook.com/oauth/access_token',
    clientId : '124518964277647',
    clientSecret : '5b2d54ed7332ce734b598ea515e0bd71'
  }
]

var client = require('oauth-client-proxy');
var proxy = client.createProxy({
//  'origins' : origins
});

proxy.listen(3030, 3031);