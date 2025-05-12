# AuthHero Project Context

This document provides essential context about the AuthHero project, its architecture, and key implementation details.

## Project Overview

AuthHero is a multi-tenant authentication system that provides identity and access management services. It consists of multiple packages and applications that work together to provide a complete authentication solution.

## Key Applications

- **react-admin**: Admin interface for managing tenants, users, applications, and more
- **auth0-proxy**: Proxy service for Auth0 compatibility
- **demo**: Demo application showcasing AuthHero functionality

## Architectural Notes

### Multi-Tenant Architecture

The system is designed to support multiple tenants (organizations/customers) where each tenant has:

- Its own users, applications, and settings
- Isolated data storage
- Custom branding options
- Potentially custom domains

### React Admin Dual Router Architecture

The React Admin application has a unique dual-router setup:

1. **Outer Router**: Handles top-level routing based on domain selection and tenant ID

   - Path `/tenants/*`: Shows tenant management interface (TenantsApp component)
   - Path `/:tenantId/*`: Shows admin interface for a specific tenant (App component)
   - Path `/auth-callback`: Handles authentication callbacks
   - Path `/`: Shows domain selector

2. **Inner Router**: Inside a specific tenant context
   - Each resource (users, clients, connections, etc.) has its own routes
   - All routes within a tenant are prefixed with the tenant ID (e.g., `/:tenantId/users`)
   - The basename prop in the Admin component is set to `/${tenantId}` to handle this

### Domain Selection System

The application supports multiple domains with:

- Cookie-based storage of available domains and selected domain
- A domain selector UI for adding and switching between domains
- Domain configuration includes URL, client ID, and optional REST API URL
- Each domain can point to a different AuthHero instance

### Tenant Context

When working within a tenant:

1. The tenant ID is extracted from the URL path
2. API requests include the tenant ID in headers
3. Data is scoped to the specified tenant
4. Tenant-specific styles and settings can be applied

### Universal Login Flow

The authentication flow uses a universal login system:

1. Users are directed to a login page
2. Authentication can be via password, code, or social providers
3. Upon successful authentication, users receive a session
4. The session is tenant-specific

## Development Guidelines

When making changes:

1. Be aware of the tenant context in API calls
2. Respect the dual router architecture
3. Consider the multi-tenant nature of all features
4. Test changes across multiple tenants

## Key File Locations

- Tenant routing logic: `src/index.tsx`, `src/App.tsx`, and `src/TenantsApp.tsx`
- Tenant API integration: `src/dataProvider.ts`
- Domain management: `src/utils/domainUtils.ts` and `src/components/DomainSelector.tsx`
- Tenant-specific UI: `src/components/TenantLayout.tsx` and `src/components/TenantAppBar.tsx`

## Environment Configuration

The application can be configured through environment variables:

- `VITE_AUTH0_DOMAIN`: Default domain if none is selected
- `VITE_AUTH0_CLIENT_ID`: Default client ID
- `VITE_AUTH0_API_URL`: Default API URL
- `VITE_SIMPLE_REST_URL`: URL for simple REST operations
