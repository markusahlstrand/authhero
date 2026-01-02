# Organizations

Organizations enable you to group users and apply specific configurations, branding, and access controls to them. Organizations are useful for B2B applications where you serve multiple customer companies.

## What is an Organization?

An organization represents a group of users within a tenant, typically corresponding to a customer company in a B2B application.

Each organization can have:

- Its own set of members (users)
- Organization-specific roles and permissions
- Custom branding and configuration
- Isolated access controls

When users authenticate with an organization context, the resulting tokens include an `org_id` claim that your API can use to enforce organization-level authorization.

## Use Cases

### B2B SaaS Applications

```
Tenant: your-saas-product
├── Organization: company-a
│   ├── Users: company-a's employees
│   └── Roles: admin, member, viewer
├── Organization: company-b
│   ├── Users: company-b's employees
│   └── Roles: admin, member
└── Organization: company-c
    ├── Users: company-c's employees
    └── Roles: admin, member, viewer, auditor
```

### Team-Based Access Control

Provide different teams within a company with isolated access:

```
Organization: engineering-team
Organization: sales-team
Organization: support-team
```

## Organization Invitations

Organization invitations provide a streamlined way to onboard new users to an organization. When you create an invitation, you can:

- **Pre-configure user attributes**: Set roles, app metadata, and user metadata before the user accepts
- **Control the connection**: Specify which authentication method the user should use
- **Set expiration**: Invitations expire after a configurable time period (default: 7 days, max: 30 days)
- **Track the inviter**: Record who sent the invitation for auditing purposes

### Invitation Flow

1. An admin creates an invitation through the Management API
2. An invitation URL is generated with a unique ticket
3. The invitee receives the invitation (optionally via email)
4. The invitee clicks the invitation URL and completes the signup/login flow
5. Upon completion, the user is automatically added to the organization with the pre-configured settings

### Invitation Properties

- `inviter`: Information about who sent the invitation
- `invitee`: Email address of the person being invited
- `client_id`: The application the user will access
- `connection_id`: Optional specific authentication connection
- `roles`: Role IDs to assign to the user
- `app_metadata` / `user_metadata`: Custom data to attach to the user
- `ttl_sec`: Time-to-live in seconds before the invitation expires
- `send_invitation_email`: Whether to automatically send an invitation email

## Organization Roles and Permissions

Organizations support role-based access control (RBAC) to manage user permissions within the organization context.

### Permission Inheritance

By default, user permissions are scoped to organizations. However, tenants can enable the `inherit_global_permissions_in_organizations` flag to allow users with tenant-level roles to inherit those permissions in all organizations.

See [Tenants](/concepts/tenants#inherit_global_permissions_in_organizations) and [Security Model](/security-model#organizations) for more details.

## API Reference

- [GET /api/v2/organizations](/api/endpoints#get-organizations)
- [POST /api/v2/organizations](/api/endpoints#create-organization)
- [PATCH /api/v2/organizations/:id](/api/endpoints#update-organization)
- [DELETE /api/v2/organizations/:id](/api/endpoints#delete-organization)
- [POST /api/v2/organizations/:id/invitations](/api/endpoints#organization-invitations)
- [GET /api/v2/organizations/:id/members](/api/endpoints#get-organization-members)
- [POST /api/v2/organizations/:id/members](/api/endpoints#add-organization-members)
