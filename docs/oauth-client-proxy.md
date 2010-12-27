

## Registering Resource Servers

Specify the following in origins-config.js (TODO- change this)

* `pattern`: URI pattern for resources
* `authorizeUri` : Authorization URI of the authorization server
* `tokenUri`: URI to obtain access tokens
* `clientId`: Client ID

The client must register the OAuth proxy (http://localhost:3031/) as the redirect_uri with the
authorization server.

## Proxy Authentication

The client using the OAuth Client Proxy must authenticate itself with the proxy and also assert the
identity of the user. The proxy uses the user's identifier to store/manage OAuth2 credentials on
behalf of the client app.

The proxy returns response code `401` with a `Proxy-Authenticate` header in case the client does
not assert user's identity.

The proxy uses the scheme `oauth2-proxy-assert` for the `Proxy-Authorization` header.

    Proxy-Authorization: oauth2-proxy-assert joe.user
    
In this example, `joe.user` is an opaque identifier for the user.
    
## Making a Request

- Use http://localhost:4000 as a forward proxy.
- Include the 'Proxy-Authorization` header.
- Include a Link header with `rel=http://oauth.proxy.org/retry` and `href` value equal to the client's URI. The proxy will redirect the user to this URI after obtaining an access token. 
    
## Alerting the User

During the OAuth flow, the client app may want to alert the user that (s)he is being redirected to
the authorization server. To enable this, the proxy will return response code 302 to the client with
a `Location` header referring to the authorization server. After alerting the user, the client must
redirect the user to the value of this `Location` header. The client must not modify the value of
this header.
