---
title: Connections
description: Configure authentication methods in AuthHero including database connections, social logins (Google, Facebook, GitHub), and enterprise SAML/LDAP connections.
---

# Connections

Connections are authentication methods available to users, such as username/password, social logins, or enterprise connections like SAML or LDAP.

## Connection Types

### Database Connections

Username and password authentication with AuthHero storing credentials:

```typescript
{
  "name": "Username-Password-Authentication",
  "strategy": "auth0",
  "enabled_clients": ["client_123"]
}
```

### Social Connections

Third-party identity providers like Google, Facebook, GitHub:

```typescript
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "client_id": "google_client_id",
    "client_secret": "google_client_secret",
    "allowed_audiences": ["https://accounts.google.com"]
  }
}
```

### Enterprise Connections

Enterprise identity providers using SAML, LDAP, or other protocols:

```typescript
{
  "name": "corporate-saml",
  "strategy": "samlp",
  "options": {
    "sign_in_endpoint": "https://idp.example.com/saml/sso",
    "sign_out_endpoint": "https://idp.example.com/saml/slo"
  }
}
```

## SAML Connections

SAML (Security Assertion Markup Language) is an enterprise authentication standard that enables single sign-on (SSO) between an identity provider (IdP) and service providers (SP). AuthHero acts as an identity provider and supports:

- **SAML Request Parsing**: Parse authentication requests from service providers
- **SAML Response Generation**: Create signed SAML responses with user attributes
- **SAML Metadata**: Provide metadata for service provider configuration
- **Flexible Signing**: Support for both local signing (Node.js) and HTTP-based signing (edge environments)

SAML connections are particularly useful for enterprise customers who need to integrate with existing identity management systems or provide SSO to third-party applications.

### SAML Configuration Example

```typescript
{
  "name": "enterprise-saml",
  "strategy": "samlp",
  "options": {
    "sign_in_endpoint": "https://idp.corp.example.com/saml/sso",
    "sign_out_endpoint": "https://idp.corp.example.com/saml/slo",
    "signing_cert": "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----",
    "sign_saml_request": true,
    "signature_algorithm": "rsa-sha256",
    "digest_algorithm": "sha256"
  }
}
```

[Learn more about SAML →](/packages/saml/)

## Passwordless Connections

Email or SMS-based authentication without passwords:

```typescript
{
  "name": "email",
  "strategy": "email",
  "options": {
    "from": "auth@example.com",
    "subject": "Your verification code"
  }
}
```

## Connection Configuration

Connections can be configured per application, allowing different apps to use different authentication methods:

```typescript
// Enable specific connections for an application
PATCH /api/v2/clients/{client_id}
{
  "enabled_connections": [
    "Username-Password-Authentication",
    "google-oauth2",
    "corporate-saml"
  ]
}
```

## API Reference

- [GET /api/v2/connections](/api/endpoints#get-connections)
- [POST /api/v2/connections](/api/endpoints#create-connection)
- [PATCH /api/v2/connections/:id](/api/endpoints#update-connection)
- [DELETE /api/v2/connections/:id](/api/endpoints#delete-connection)
