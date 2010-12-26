
// This module contains the origin registry.

var origins = [
  {
    pattern : /^http\:\/\/localhost\:5000\/resource/,
    authorizeUri : 'http://localhost:4999/authorize',
    tokenUri : 'http://localhost:4999/token',
    clientId : '71746698906'
  }
]

exports.findOrigin = function(uri) {
  for (var i = 0, len = origins.length; i < len; i++) {
    var origin = origins[i]
    if (origin.pattern.test(uri)) {
      return origin
    }
  }
  return undefined
}