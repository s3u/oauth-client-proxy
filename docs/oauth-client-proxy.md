

## Proxy Authentication

Gather the following data.

* `user`: An identifier to uniquely identify each user. The proxy does not need to know anything
  about users.
* `nonce`: A nonce
* `timestamp`: Current date-time value encoded as per
  [RFC-3339](http://tools.ietf.org/html/rfc3339#section-5.6)

Generate a base string by concatenating the above.

* Sort the above parameters using lexicographical byte value ordering
* Concatenate the parameters into a single string in their sorted order. For each parameter,
  separate the name from the corresponding value by an `=` character (`U+003D`) Separate each
  name-value pair by an ampersand character (`U+0026`) 
  
