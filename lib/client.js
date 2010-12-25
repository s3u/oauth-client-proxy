var URI = require('uri'),
  http = require('http'),
  sys = require('sys'),
  crypto = require('crypto')

exports.request = function(obj) {
  sys.log('>>> Sending ' + obj.method + ' request to ' + obj.uri)

  var uri = new URI(obj.uri, false)

  var isTls = uri.scheme() == 'https:'
  var port = uri.heirpart().authority().port()
  if (!port) {
    port = isTls ? 443 : 80
  }
  var host = uri.heirpart().authority().host()
  var path = (uri.heirpart().path().value || '') + (uri.querystring() || '')

  // Route the request through an http proxy
  if (obj.proxy) {
    var proxyUri = new URI(obj.proxy, false)
    var proxyHost = proxyUri.heirpart().authority().host()
    var proxyPort = proxyUri.heirpart().authority().port()
  }

  var client
  if (isTls) {
    var creds = crypto.createCredentials({})
    client = http.createClient(proxyPort || port, proxyHost || host, isTls, creds)
  }
  else {
    client = http.createClient(proxyPort || port, proxyHost || host)
  }

  // This will catch all errors on the client object
  client.on('error', function(err) {
    sys.log('got an error: ' + err)
    if (obj.connectError) {
      obj.connectError(err)
    }
    else {
      throw err
    }
  })

  try {
    var _headers = clone(obj.headers)
    _headers.host = host + ':' + port
    var request = client.request(obj.method, path, _headers)
    if(obj.body) {
      request.write(obj.body)
    }
    request.end()
    request.on('response', function (response) {
      sys.log('---------- response code: ' + response.statusCode)
      response.setEncoding('utf8')

      var handler = findHandler(obj, response)
      if (handler && typeof handler == 'function') {
        handler(response)
      }
    })
  }
  catch(e) {
    sys.log(sys.inspect(e))
  }
}

function findHandler(obj, response) {
  if (response) {
    var handler = obj[response.statusCode]
    if (handler == undefined) {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        handler = obj.success
      }
      else if (response.statusCode >= 400 && response.statusCode < 500) {
        handler = obj.clientError
      }
      else if (response.statusCode >= 500 && response.statusCode < 600) {
        handler = obj.serverError
      }
    }
  }
  if (!handler) {
    if (obj.error) {
      handler = obj.error
    }
    else if (obj.response) {
      handler = obj.response
    }
  }
  return handler
}

function clone(obj) {
  var clone = {};
  for (property in obj) {
    if (obj.hasOwnProperty(property)) {
      clone[property] = obj[property]
    }
  }
  return clone;
}

