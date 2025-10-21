# AuthHero Architecture

This document provides an overview of the AuthHero architecture and how its components interact.

## System Overview

AuthHero is built as a modular system with several key components:

1. **Core Library (authhero)**: The main package that handles authentication logic and API requests
2. **SAML Package (@authhero/saml)**: Separate package for SAML authentication with pluggable signing strategies
3. **Admin Dashboard (react-admin)**: Web application for managing auth tenants
4. **Adapters**: Interface implementations for various databases and services
5. **CLI Tool (create-authhero)**: Command-line interface for creating new projects

## Multi-Tenant Architecture

The system is designed to support multiple tenants (organizations/customers) where each tenant has:

- Its own users, applications, and settings
- Isolated data storage
- Custom branding options
- Potentially custom domains

## React Admin Dual Router Architecture

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

## Domain Selection System

The application supports multiple domains with:

- Cookie-based storage of available domains and selected domain
- A domain selector UI for adding and switching between domains
- Domain configuration includes URL, client ID, and optional REST API URL
- Each domain can point to a different AuthHero instance

## Component Diagram

[A diagram will be placed here]

## Data Flow

[Data flow description will go here]

## Database Structure

[Database structure overview will go here]

## Authentication Flow

[Authentication flow description will go here]

## Integration Points

[API and integration information will go here]
