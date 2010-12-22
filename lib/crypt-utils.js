var crypto = require('crypto')

// encrypts and returns url safe data
exports.encryptThis = function(data, key) {
  var cipher = crypto.createCipher('aes256', key)
  cipher.update(data, 'utf8', 'base64')
  var encrypted = cipher.final('base64')
  return encodeBase64Url(encrypted)
}

// input is a url safe encrypted data
exports.decryptThis = function(encrypted, key) {
  var _encrypted = decodeBase64Url(encrypted)
  var decipher = crypto.createDecipher('aes256', key)
  decipher.update(_encrypted, 'base64', 'utf8')
  return decipher.final('utf8')
}

// hmac using sha1
exports.hmacThis = function(data, key) {
  var hmac = crypto.createHmac('sha1', key)
  hmac.update(data)
  var hashed = hmac.digest('base64')
  return encodeBase64Url(hashed)
}

exports.verifyHmac = function(data, key, hash) {
  var _hash = this.hmacThis(data, key)
  return _hash == hash
}

// data is already base64 encoded
function encodeBase64Url(data) {
  var encoded = '';
  var cur = 0;

  while (cur < data.length) {
    var curChar = data.charAt(cur)
    switch (curChar) {
      case '+' :
        encoded += '-'
        break
      case '/' :
        encoded += '_'
        break
      default:
        encoded += curChar
    }
    cur++
  }
  return encoded
}

function decodeBase64Url(data) {
  var decoded = '';
  var cur = 0;

  while (cur < data.length) {
    var curChar = data.charAt(cur)
    switch (curChar) {
      case '-' :
        decoded += '+'
        break
      case '_' :
        decoded += '/'
        break
      default:
        decoded += curChar
    }
    cur++
  }
  return decoded
}
