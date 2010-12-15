# Design Notes

## OAuth Proxy

This is a forward proxy deployed between OAuth clients and OAuth servers.

## How to Use

Setup the proxy and specify the resource server configuration. The proxy uses basic authentication
and TLS.

## Flow

1. Client sends a request to the resource server
   * Client uses the OAuth Proxy as a forward proxy to make the request.
   * Client includes some opaque state about the request in the URI as a query parameter.

2. Proxy responds with `Proxy-Authenticate` if there are no credentials in the request.

3. Client sends an `Proxy-Authorization` header to authorize the client to the proxy.

4. Proxy uses the `Proxy-Authorization` header and some regex matching to load the following.
   * resource server config
   * access token
   
5. If resource server config is not found, it returns a 400 to the client.

6. If access token is not found, sends a redirect request to the client
   * The `Location` header points to the auth server
   
7. Client redirects the user to the Auth server

8. User completes the auth flow and is redirected to client
   * Here, the redirect URI points to the client
   
9. Client extracts the state from the opaque token
   * It could use a specific redirect_uri to avoid the state but with the proxy mode, it is not
     possible 
     
10. Client makes the request to the proxy again with the same `Proxy-Authorization` header
    * This time it includes the code in the request (as a query parameter?)
    
11. Proxy extracts the code and send it to the server to obtain the access token. It then stores the
    access token.
    
12. Proxy makes a request to the resource server.
    * If the response is a success, it returns the response to the client.

13. If it gets a 401 with `error_description="The access token expired"`, the proxy starts the token
    refresh flow.
    
    * Proxy sends a request to the auth server for the refresh token
    * Obtains the refresh token and stores it
    * Then retries the request - it has to keep the state during this time
    
14. Done
      
 

-->
