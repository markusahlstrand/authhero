// This is a temporary test file to demonstrate the missing test case
// for permissions not being included in tokens with access_token_authz dialect

/* 
The missing test scenario:
1. Create a resource server with:
   - enforce_policies: true
   - token_dialect: "access_token_authz"
2. Create a user with permissions for that resource server
3. Make a token request with the resource server as audience
4. Verify that the JWT token payload includes the permissions array

Current issue:
- calculateScopesAndPermissions correctly computes permissions
- But these permissions are not passed to createAuthTokens
- So the JWT payload does not include the permissions
*/

console.log(
  "Test case missing: Permissions not included in JWT tokens when using access_token_authz dialect",
);
