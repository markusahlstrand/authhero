# Silent Authentication Flow

This document describes how the silent authentication flow works in AuthHero, which is compatible with the Auth0 silent authentication implementation.

## Overview

Silent authentication allows applications to renew expired access tokens without requiring user interaction, such as showing a login screen. This flow is particularly useful for Single Page Applications (SPAs) that need to maintain user sessions across browser refreshes or when tokens expire.

## How Silent Authentication Works

The silent authentication flow leverages an existing user session to obtain new tokens transparently. Here's how it works:

### 1. Initial Authentication

Before silent authentication can be used, the user must have completed an initial authentication flow:

1. User visits the application
2. Application redirects to AuthHero's `/authorize` endpoint
3. User completes authentication (login form, social login, etc.)
4. AuthHero creates a **login session** and subsequently a **session** upon successful authentication
5. AuthHero sets an HttpOnly cookie containing the login ID on the user's browser
6. AuthHero redirects back to the application with an authorization code
7. Application exchanges the code for tokens at the `/token` endpoint

### 2. Silent Authentication Process

When the application needs to renew tokens silently:

1. **Initialize Silent Auth**: The application calls the `/authorize` endpoint with `prompt=none` parameter in a hidden iframe
2. **Session Check**: AuthHero checks for the HttpOnly session cookie to verify if the user has an active session
3. **Authorization**: If a valid session exists, AuthHero immediately generates an authorization code without user interaction
4. **Response**: AuthHero returns an HTML document containing the authorization code to the iframe
5. **Token Exchange**: The application extracts the code from the iframe response and exchanges it for new tokens at the `/token` endpoint

## Request Parameters

### Silent Auth Authorize Request

```
GET /authorize?
  response_type=code&
  client_id={client_id}&
  redirect_uri={redirect_uri}&
  scope={scope}&
  audience={audience}&
  prompt=none&
  state={state}
```

#### Key Parameters

- `prompt=none`: **Required** - Indicates this is a silent authentication request
- `client_id`: Must match the original authentication request
- `scope`: Must be the same as or a subset of the original scopes
- `audience`: Must match the original audience
- `redirect_uri`: Can be different from the original redirect URI (following Auth0's flexibility)

### Token Exchange Request

The token exchange follows the standard authorization code flow:

```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code={authorization_code}&
client_id={client_id}&
client_secret={client_secret}&
redirect_uri={redirect_uri}
```

## Response Handling

### Successful Silent Auth

When silent authentication succeeds, the iframe receives an HTML document containing the authorization code. The application should:

1. Extract the code from the iframe response
2. Exchange the code for tokens using the `/token` endpoint
3. Update the application's token storage with the new tokens

### Failed Silent Auth

Silent authentication can fail for several reasons:

- **No Active Session**: User doesn't have a valid session cookie
- **Session Expired**: The user's session has expired
- **Scope Mismatch**: Requested scopes exceed the original authorization
- **Audience Mismatch**: Requested audience doesn't match the original

When silent auth fails, the application should fall back to interactive authentication by redirecting the user to the login page.

## Security Considerations

### HttpOnly Session Cookies

The session cookie used for silent authentication is set as HttpOnly, which means:

- It cannot be accessed via JavaScript
- It's automatically included in requests to the AuthHero domain
- It provides protection against XSS attacks

### Scope and Audience Restrictions

Silent authentication enforces strict limitations:

- **Scopes**: Cannot request additional scopes beyond those granted in the initial authorization
- **Audience**: Must exactly match the original audience
- **Client**: Must use the same client ID as the original authorization

### Iframe Security

When implementing silent authentication:

- Use a hidden iframe to avoid user interface disruption
- Implement proper error handling for failed silent auth attempts
- Consider implementing timeouts for iframe requests

## Implementation Example

### JavaScript Implementation

```javascript
function performSilentAuth(clientId, audience, scope, redirectUri) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    
    const state = generateRandomState();
    const authUrl = `https://your-domain.com/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `audience=${encodeURIComponent(audience)}&` +
      `prompt=none&` +
      `state=${state}`;
    
    iframe.onload = () => {
      try {
        // Extract code from iframe response
        const code = extractCodeFromIframe(iframe);
        if (code) {
          // Exchange code for tokens
          exchangeCodeForTokens(code, redirectUri)
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error('Silent auth failed'));
        }
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(iframe);
      }
    };
    
    iframe.src = authUrl;
    document.body.appendChild(iframe);
  });
}
```

## Differences from Auth0

AuthHero's silent authentication implementation is fully compatible with Auth0's implementation, including:

- **Redirect URI Flexibility**: Like Auth0, AuthHero allows the `redirect_uri` parameter in silent auth requests to differ from the original authorization request's redirect URI. While this deviates from the strict OAuth 2.0 specification, it provides practical flexibility for applications that need to handle silent auth responses at different endpoints.

## OAuth 2.0 Specification Notes

It's worth noting that allowing different redirect URIs in silent authentication requests is a deviation from the strict OAuth 2.0 specification. However, both Auth0 and AuthHero implement this flexibility because:

1. **Practical Use Cases**: Applications often need to handle silent auth callbacks at different endpoints than interactive auth
2. **Single Page Applications**: SPAs may use different callback handlers for silent vs. interactive flows
3. **Security**: The same security validations apply - the redirect URI must still be registered for the client

This flexibility is widely adopted in the industry and considered a practical enhancement to the OAuth 2.0 flow.

## Best Practices

1. **Implement Fallback**: Always implement a fallback to interactive authentication when silent auth fails
2. **Token Renewal Strategy**: Implement automatic token renewal before tokens expire
3. **Error Handling**: Properly handle all possible error scenarios
4. **Security Headers**: Ensure proper security headers are set for iframe communication
5. **Timeout Handling**: Implement timeouts for silent auth requests to avoid hanging operations

## Troubleshooting

### Common Issues

- **CORS Errors**: Ensure proper CORS configuration for iframe domains
- **Cookie Issues**: Verify that session cookies are being set and transmitted correctly
- **Scope Errors**: Check that silent auth requests don't exceed original scope grants
- **Domain Mismatches**: Ensure the silent auth request uses the correct AuthHero domain

### Debugging Tips

- Check browser developer tools for network requests and cookie information
- Verify that the session cookie is present and not expired
- Confirm that iframe requests are reaching the AuthHero server
- Review AuthHero logs for silent authentication attempts and failures
