
1. Register a client

In:

- Some opaque set of name value pairs
- redirect_uri

Out:

- Client ID
- Client shared secret

2. Obtaining access token

In:

- response_type: `token` (for access token), `code` (for auth code), or `code_and_token` (for both)
- client_id
- redirect_uri
- scope (?)
- state (?)

Q: What is the difference between `token` and `code`

Logic: Implement auth flow

- Present UI screen for scopes
- Login the user if necessary
-

Out:

- redirect to the redirect_uri
- `code`
- `access_token`
- `expires_in`
- `scope`
- `state`
