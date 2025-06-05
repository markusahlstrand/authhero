# Multi-Tenant Support: AuthHero vs. Auth0

AuthHero is designed from the ground up to support true multi-tenant authentication within a single installation. This provides significant flexibility and efficiency for SaaS platforms, agencies, and organizations managing multiple brands or customers.

## AuthHero's Multi-Tenant Architecture

- **Single Installation, Multiple Tenants**: One AuthHero deployment can securely manage authentication for many tenants (organizations, customers, or brands).
- **Tenant Management Endpoints**: AuthHero exposes dedicated endpoints for creating, updating, and managing tenants, making it easy to automate or integrate tenant lifecycle operations.
- **Flexible Domain Strategies**:
  - **Custom Domains**: Each tenant can be hosted on its own custom domain (e.g., `login.customer.com`).
  - **Subdomains**: Tenants can be separated by subdomains (e.g., `tenant1.authhero.com`, `tenant2.authhero.com`).
  - **Shared Domain**: Multiple tenants can also share a single domain, with AuthHero distinguishing tenants using unique client IDs or custom headers.
- **Compatibility**: This approach is fully compatible with the Auth0 standard client model, making migration or hybrid setups straightforward.

## Key Differences Summarized

| Feature                  | Auth0                          | AuthHero                                   |
| ------------------------ | ------------------------------ | ------------------------------------------ |
| **Multi-Tenant Model**   | Per-tenant Auth0 tenant        | Single install, many tenants               |
| **Tenant Management**    | Admin dashboard/API per tenant | Centralized endpoints for all tenants      |
| **Domain Options**       | Custom domain per tenant       | Custom domain, subdomain, or shared domain |
| **Tenant Routing**       | By domain                      | By domain, subdomain, client ID, or header |
| **Client Compatibility** | Standard clients               | Standard clients (Auth0 compatible)        |

AuthHero's multi-tenant support enables you to scale authentication for many organizations with a single, efficient deployment, while offering flexible domain and routing strategies to fit your business needs.
