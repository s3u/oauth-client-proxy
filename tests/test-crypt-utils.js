
// Use expresso to run this

var cryptUtils = require('../lib/crypt-utils'),
  assert = require('assert'),
  should = require('should'),
  sys = require('sys');

module.exports = {
  'test crypt': function() {
    var plain = 'Hello world'
    var secret = 'This is a secret. Keep it secret :)'
    var encrypted = cryptUtils.encryptThis(plain, secret)
    var decrypted = cryptUtils.decryptThis(encrypted, secret)
    assert.equal(decrypted, plain)
  },

  'test crypt-large': function() {
    var plain = 'Hello world this is a long world. Yes it is.'
    var secret = 'This is a secret. Keep it secret :)'
    var encrypted = cryptUtils.encryptThis(plain, secret)
    var decrypted = cryptUtils.decryptThis(encrypted, secret)
    assert.equal(decrypted, plain)
  },

  'test hmac': function() {
    var plain = 'Hello world'
    var secret = 'This is a secret. Keep it secret :)'
    var encrypted = cryptUtils.encryptThis(plain, secret)
    var hmac = cryptUtils.hmacThis(encrypted, secret)
    assert.ok(cryptUtils.verifyHmac(encrypted, secret, hmac))
  }
};