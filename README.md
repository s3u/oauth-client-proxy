**Hot code. Will burn your hands if touched.**

# OAuth Forward Proxy

OAuth is an HTTP based protocol that allows client apps to get credentials and make authenticated
requests to protected resources on behalf of users. The most commonly used approach to support OAuth
in client apps is to code to an OAuth client library in whatever language that the client app is
built in. Usually, clients app end up hardwiring their UI flow and application logic with the chosen
OAuth library.

But, OAuth is an HTTP based protocol. It would be great for client app development if we could add
OAuth support by just routing the outbound traffic from clients to protected resources via a forward
proxy that understands OAuth. For instance, if the client wants to access a protected resource at
`http://my.example.org/profile/subbu`, it should be able to do so by dispatching the request via a
forward proxy.

    GET http://my.example.org/profile/subbu
    Host: proxy.client.com:3030

But since OAuth involves getting user authorization - a manual step, getting and storing access
tokens for each user, and handling failures, the request needs to include some extra inputs.

    GET http://my.example.org/profile/subbu
    Host: proxy.client.com:3030
    Proxy-Authorization: proxy-assert subbu
    Link: <http://myapp.client.com/somepage?userid=subbu>;rel="oauth-proxy-continue"

The `Proxy-Authorization` header here asserts the user's identity to the proxy, so that the proxy
could differentiate between requests for different users. It uses a authentication scheme I made to
assert user identity. In the real-world, the client will need to either use signatures, or use
mutual authentication over TLS to ensure that the assertion is kept confidential and tamper-proof. 

The `Link` header tells the proxy a URI to use to restart flow in case the proxy needs to abort the
client request to get explicit user authorization.

That's all. The proxy takes care of implementation details of the OAuth protocol.
