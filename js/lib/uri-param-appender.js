exports.appendParam = appendParam

URI = require('uri')

/*
 * Appends the given params to the URI. This implementation parses the URI every time it is called.
 */
function appendParam(uri, params) {
  var dest = new URI(uri);
  var query = dest.querystring() || '?'
  if (query.charAt(query.length - 1) != '?') {
    query += '&';
  }
  for (name in params) {
    if (params.hasOwnProperty(name)) {
      query += encodeURIComponent(name) + '=' + encodeURIComponent(params[name]) + '&';
    }
  }
  if(query.charAt(query.length - 1) == '&') {
    query = query.substring(0, query.length -1);
  }

  return dest.scheme() + dest.heirpart().value + query + (dest.fragment() || '');
}