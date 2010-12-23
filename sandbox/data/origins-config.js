var origins = [
  {
    pattern : /^http\:\/\/localhost\:5000\/resource/,
    authorizeUri : 'http://localhost:4998/authorize',
    clientId : '71746698906',
    secret: 'I am a shared secret'
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