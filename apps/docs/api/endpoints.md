---
title: API Endpoints
description: Complete reference for AuthHero API endpoints including Auth API for authentication and Management API for administrative operations.
---

# API Endpoints

This document provides details on the available API endpoints in AuthHero.

## Base URLs

- **Auth API**: `/` (Authentication and user-facing endpoints)
- **Management API**: `/api/v2` (Administrative endpoints)

## Authentication

All Management API endpoints require authentication with a Bearer token that has appropriate scopes.

**Headers:**

```
Authorization: Bearer <your-token>
tenant-id: <your-tenant-id>
```

**Scopes:**

- `auth:read` - Read access to resources
- `auth:write` - Write access to resources

## Auth API Endpoints

### POST /oauth/token

Exchanges credentials for access tokens.

**Request Body:**

```json
{
  "grant_type": "password",
  "username": "user@example.com",
  "password": "password",
  "client_id": "your-client-id",
  "scope": "openid profile email"
}
```

**Response:**

```json
{
  "access_token": "...",
  "id_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### POST /dbconnections/signup

Registers a new user.

**Request Body:**

```json
{
  "email": "newuser@example.com",
  "password": "password",
  "connection": "database",
  "user_metadata": {}
}
```

**Response:**

```json
{
  "id": "user-123",
  "email": "newuser@example.com",
  "created_at": "2023-01-01T00:00:00.000Z",
  "updated_at": "2023-01-01T00:00:00.000Z"
}
```

## Management API Endpoints

The Management API provides endpoints for managing all aspects of your AuthHero tenant.

### Organizations

Manage organizations within your tenant.

#### List Organizations

List all organizations.

**Endpoint:** `GET /api/v2/organizations`

**Query Parameters:**

- `page` (optional): Page number
- `per_page` (optional): Results per page (default: 10)
- `include_totals` (optional): Include pagination totals
- `sort` (optional): Sort order (e.g., "name:asc")
- `q` (optional): Search query

**Response:**

```json
[
  {
    "id": "org_123",
    "name": "Acme Corporation",
    "display_name": "Acme Corp",
    "branding": {
      "logo_url": "https://example.com/logo.png",
      "colors": {
        "primary": "#1E40AF",
        "page_background": "#F8FAFC"
      }
    },
    "metadata": {},
    "enabled_connections": [],
    "token_quota": {},
    "created_at": "2025-09-10T10:00:00.000Z",
    "updated_at": "2025-09-10T10:00:00.000Z"
  }
]
```

#### Create Organization

Create a new organization.

**Endpoint:** `POST /api/v2/organizations`

**Request Body:**

```json
{
  "name": "New Organization",
  "display_name": "New Org",
  "branding": {
    "logo_url": "https://example.com/logo.png",
    "colors": {
      "primary": "#1E40AF"
    }
  },
  "metadata": {
    "department": "Engineering"
  }
}
```

#### Get Organization by ID

Get a specific organization.

**Endpoint:** `GET /api/v2/organizations/{id}`

#### Update Organization

Update an organization.

**Endpoint:** `PATCH /api/v2/organizations/{id}`

#### Delete Organization

Delete an organization.

**Endpoint:** `DELETE /api/v2/organizations/{id}`

#### Organization Invitations

Manage invitations to join an organization. Invitations allow you to onboard new users to an organization with pre-configured roles, metadata, and connection settings.

##### List Organization Invitations

List all invitations for an organization.

**Endpoint:** `GET /api/v2/organizations/{id}/invitations`

**Query Parameters:**

- `page` (optional): Page index of the results to return. First page is 0 (default: 0)
- `per_page` (optional): Number of results per page (default: 50)
- `include_totals` (optional): When `true`, return results inside an object that also contains the start and limit. When `false` (default), a direct array of results is returned
- `fields` (optional): Comma-separated list of fields to include or exclude (based on value provided for `include_fields`) in the result. Leave empty to retrieve all fields
- `include_fields` (optional): Whether specified fields are to be included (`true`) or excluded (`false`). Defaults to `true`
- `sort` (optional): Field to sort by. Use `field:order` where order is `1` for ascending and `-1` for descending. Defaults to `created_at:-1`

**Response (without include_totals):**

```json
[
  {
    "id": "inv_123abc",
    "organization_id": "org_456def",
    "inviter": {
      "name": "Admin User"
    },
    "invitee": {
      "email": "newuser@example.com"
    },
    "invitation_url": "https://your-domain.com/invitation?ticket=...",
    "ticket_id": "...",
    "client_id": "client_123",
    "connection_id": "con_456",
    "app_metadata": {
      "role": "member"
    },
    "user_metadata": {
      "department": "Engineering"
    },
    "roles": ["role_123"],
    "ttl_sec": 604800,
    "send_invitation_email": true,
    "created_at": "2025-10-27T10:00:00.000Z",
    "expires_at": "2025-11-03T10:00:00.000Z"
  }
]
```

**Response (with include_totals=true):**

```json
{
  "invitations": [
    {
      "id": "inv_123abc",
      "organization_id": "org_456def",
      "inviter": {
        "name": "Admin User"
      },
      "invitee": {
        "email": "newuser@example.com"
      },
      "invitation_url": "https://your-domain.com/invitation?ticket=...",
      "ticket_id": "...",
      "client_id": "client_123",
      "connection_id": "con_456",
      "app_metadata": {
        "role": "member"
      },
      "user_metadata": {
        "department": "Engineering"
      },
      "roles": ["role_123"],
      "ttl_sec": 604800,
      "send_invitation_email": true,
      "created_at": "2025-10-27T10:00:00.000Z",
      "expires_at": "2025-11-03T10:00:00.000Z"
    }
  ],
  "start": 0,
  "limit": 50,
  "length": 1
}
```

##### Create Organization Invitation

Create a new invitation for an organization.

**Endpoint:** `POST /api/v2/organizations/{id}/invitations`

**Request Body:**

```json
{
  "inviter": {
    "name": "Admin User"
  },
  "invitee": {
    "email": "newuser@example.com"
  },
  "client_id": "client_123",
  "connection_id": "con_456",
  "app_metadata": {
    "role": "member"
  },
  "user_metadata": {
    "department": "Engineering"
  },
  "roles": ["role_123"],
  "ttl_sec": 604800,
  "send_invitation_email": true
}
```

**Field Descriptions:**

- `inviter.name` (required): Name of the person sending the invitation
- `invitee.email` (required): Email address of the person being invited
- `client_id` (required): Client ID for the invitation flow
- `connection_id` (optional): Specific connection to use
- `app_metadata` (optional): Application metadata to assign to the user
- `user_metadata` (optional): User metadata to assign to the user
- `roles` (optional): Array of role IDs to assign to the user (default: `[]`)
- `ttl_sec` (optional): Time-to-live in seconds (default: 604800 = 7 days, max: 2592000 = 30 days)
- `send_invitation_email` (optional): Whether to send invitation email (default: `true`)

**Response:**

```json
{
  "id": "inv_123abc",
  "organization_id": "org_456def",
  "inviter": {
    "name": "Admin User"
  },
  "invitee": {
    "email": "newuser@example.com"
  },
  "invitation_url": "https://your-domain.com/invitation?ticket=...",
  "ticket_id": "...",
  "client_id": "client_123",
  "connection_id": "con_456",
  "app_metadata": {
    "role": "member"
  },
  "user_metadata": {
    "department": "Engineering"
  },
  "roles": ["role_123"],
  "ttl_sec": 604800,
  "send_invitation_email": true,
  "created_at": "2025-10-27T10:00:00.000Z",
  "expires_at": "2025-11-03T10:00:00.000Z"
}
```

##### Get Organization Invitation

Get a specific invitation.

**Endpoint:** `GET /api/v2/organizations/{id}/invitations/{invitation_id}`

**Response:**

Returns a single invitation object (same structure as create response).

##### Delete Organization Invitation

Delete an invitation.

**Endpoint:** `DELETE /api/v2/organizations/{id}/invitations/{invitation_id}`

**Response:**

Returns `204 No Content` on success.

### Users

Manage users in your tenant.

#### List Users

List all users.

**Endpoint:** `GET /api/v2/users`

**Query Parameters:**

- `page`, `per_page`, `include_totals` - Pagination
- `sort` - Sort order
- `q` - Search query (supports `email:user@example.com`, `user_id:123`, etc.)

#### Create User

Create a new user.

**Endpoint:** `POST /api/v2/users`

#### Get User by ID

Get a specific user.

**Endpoint:** `GET /api/v2/users/{id}`

#### Update User

Update a user's properties, including linked account identities.

**Endpoint:** `PATCH /api/v2/users/{id}`

**Request Body:**

```json
{
  "email": "updated@example.com",
  "email_verified": true,
  "name": "Updated Name",
  "app_metadata": {
    "role": "admin"
  },
  "user_metadata": {
    "preference": "value"
  }
}
```

**Updating Linked Accounts:**

When a user has multiple linked identities (e.g., a primary email account and a linked SMS or password account), you can update a specific identity by including a `connection` parameter:

```json
{
  "phone_number": "+1234567890",
  "connection": "sms"
}
```

This will update the linked identity that matches the specified connection. Supported update operations for linked accounts:

- **Phone Number**: Update `phone_number` for SMS connections
- **Email Verified**: Update `email_verified` status for any connection
- **App Metadata**: Update `app_metadata` for any connection
- **User Metadata**: Update `user_metadata` for any connection
- **Password**: Update password for `Username-Password-Authentication` connections

**Important Notes:**

- If no `connection` is specified, the primary user account is updated
- If the `connection` matches the primary user's connection, the primary account is updated
- If the `connection` matches a linked secondary account, that account is updated
- Returns 404 if the specified connection doesn't exist for the user
- **Password updates for linked accounts**: When updating a password with a `connection` parameter, the connection must be `Username-Password-Authentication`. Auth0 does not allow password changes for other connection types on linked accounts.

**Example - Update Secondary SMS Account:**

```bash
curl --request PATCH \
  --url 'https://yourdomain.com/api/v2/users/auth2|primary-user-id' \
  --header 'Authorization: Bearer YOUR_TOKEN' \
  --header 'Content-Type: application/json' \
  --header 'tenant-id: YOUR_TENANT_ID' \
  --data '{
    "phone_number": "+1234567890",
    "connection": "sms"
  }'
```

**Example - Update Password on Linked Account:**

```bash
curl --request PATCH \
  --url 'https://yourdomain.com/api/v2/users/email|primary-user-id' \
  --header 'Authorization: Bearer YOUR_TOKEN' \
  --header 'Content-Type: application/json' \
  --header 'tenant-id: YOUR_TENANT_ID' \
  --data '{
    "password": "newPassword123!",
    "connection": "Username-Password-Authentication"
  }'
```

**Response:**

Returns the primary user object with all identities included.

#### Delete User

Delete a user.

**Endpoint:** `DELETE /api/v2/users/{id}`

### Clients (Applications)

Manage OAuth clients/applications.

#### List Clients

List all clients.

**Endpoint:** `GET /api/v2/clients`

#### Create Client

Create a new client.

**Endpoint:** `POST /api/v2/clients`

#### Get Client by ID

Get a specific client.

**Endpoint:** `GET /api/v2/clients/{id}`

#### Update Client

Update a client.

**Endpoint:** `PATCH /api/v2/clients/{id}`

#### Delete Client

Delete a client.

**Endpoint:** `DELETE /api/v2/clients/{id}`

#### Get Client Connections

Get the list of connections enabled for a specific client.

**Endpoint:** `GET /api/v2/clients/{id}/connections`

**Response:**

```json
{
  "enabled_connections": [
    {
      "connection_id": "con_123",
      "connection": {
        "id": "con_123",
        "name": "Username-Password-Authentication",
        "strategy": "auth0"
      }
    }
  ]
}
```

**Notes:**

- If no connections are explicitly defined for the client, all available connections in the tenant are returned
- The order of connections in the array determines the display order on the universal login screen

#### Update Client Connections

Update the list of connections enabled for a specific client. The order of connection IDs determines the display order on the universal login screen.

**Endpoint:** `PATCH /api/v2/clients/{id}/connections`

**Request Body:**

```json
["con_123", "con_456", "con_789"]
```

**Response:**

```json
{
  "enabled_connections": [
    {
      "connection_id": "con_123",
      "connection": { ... }
    },
    {
      "connection_id": "con_456",
      "connection": { ... }
    },
    {
      "connection_id": "con_789",
      "connection": { ... }
    }
  ]
}
```

**Notes:**

- Send an ordered array of connection IDs
- The array completely replaces the existing connections list
- Connection IDs that don't exist will be filtered out
- **This endpoint supports explicit ordering of connections - a feature not available in Auth0** - allowing you to control the order in which authentication options appear on the login screen

### Connections

Manage authentication connections.

#### List Connections

List all connections.

**Endpoint:** `GET /api/v2/connections`

#### Create Connection

Create a new connection.

**Endpoint:** `POST /api/v2/connections`

#### Get Connection by ID

Get a specific connection.

**Endpoint:** `GET /api/v2/connections/{id}`

#### Update Connection

Update a connection.

**Endpoint:** `PATCH /api/v2/connections/{id}`

#### Delete Connection

Delete a connection.

**Endpoint:** `DELETE /api/v2/connections/{id}`

### Roles

Manage user roles.

#### List Roles

List all roles.

**Endpoint:** `GET /api/v2/roles`

#### Create Role

Create a new role.

**Endpoint:** `POST /api/v2/roles`

#### Get Role by ID

Get a specific role.

**Endpoint:** `GET /api/v2/roles/{id}`

#### Update Role

Update a role.

**Endpoint:** `PATCH /api/v2/roles/{id}`

#### Delete Role

Delete a role.

**Endpoint:** `DELETE /api/v2/roles/{id}`

### Resource Servers

Manage API resource servers.

#### List Resource Servers

List all resource servers.

**Endpoint:** `GET /api/v2/resource-servers`

#### Create Resource Server

Create a new resource server.

**Endpoint:** `POST /api/v2/resource-servers`

#### Get Resource Server by ID

Get a specific resource server.

**Endpoint:** `GET /api/v2/resource-servers/{id}`

#### Update Resource Server

Update a resource server.

**Endpoint:** `PATCH /api/v2/resource-servers/{id}`

#### Delete Resource Server

Delete a resource server.

**Endpoint:** `DELETE /api/v2/resource-servers/{id}`

### Other Endpoints

#### Tenant Settings

Manage tenant settings.

**Endpoint:** `GET /api/v2/tenants`

#### Audit Logs

Access audit logs.

**Endpoint:** `GET /api/v2/logs`

#### User Sessions

Manage user sessions.

**Endpoint:** `GET /api/v2/sessions`

#### Signing Keys

Manage signing keys.

**Endpoint:** `GET /api/v2/keys`

#### Tenant Branding

Manage tenant branding.

**Endpoint:** `GET /api/v2/branding`

#### Custom Domains

Manage custom domains.

**Endpoint:** `GET /api/v2/custom-domains`

## Common Query Parameters

Most list endpoints support these query parameters:

- `page`: Page number (1-based)
- `per_page`: Number of results per page (default: 10, max: 100)
- `include_totals`: Include total count in response (default: false)
- `sort`: Sort field and order (e.g., "created_at:desc", "name:asc")
- `q`: Search query with field-specific syntax

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "not_found",
  "error_description": "The requested resource was not found"
}
```

Common HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

## OpenAPI Documentation

Interactive API documentation is available at:

- Auth API: `GET /.well-known/openapi.json`
- Management API: `GET /api/v2/spec`

## Examples

### Create an Organization

```bash
curl -X POST https://your-domain.com/api/v2/organizations \
  -H "Authorization: Bearer your-token" \
  -H "tenant-id: your-tenant-id" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Organization",
    "display_name": "My Org"
  }'
```

### List Users with Search

```bash
curl "https://your-domain.com/api/v2/users?q=email:user@example.com" \
  -H "Authorization: Bearer your-token" \
  -H "tenant-id: your-tenant-id"
```

### Update a Client

```bash
curl -X PATCH https://your-domain.com/api/v2/clients/client-id \
  -H "Authorization: Bearer your-token" \
  -H "tenant-id: your-tenant-id" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Client Name"
  }'
```

### Create an Organization Invitation

```bash
curl -X POST https://your-domain.com/api/v2/organizations/org_123/invitations \
  -H "Authorization: Bearer your-token" \
  -H "tenant-id: your-tenant-id" \
  -H "Content-Type: application/json" \
  -d '{
    "inviter": {
      "name": "Admin User"
    },
    "invitee": {
      "email": "newuser@example.com"
    },
    "client_id": "client_123",
    "roles": ["role_member"],
    "app_metadata": {
      "department": "Engineering"
    }
  }'
```
