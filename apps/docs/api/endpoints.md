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

#### GET /api/v2/organizations

List all organizations.

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

#### POST /api/v2/organizations

Create a new organization.

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

#### GET /api/v2/organizations/{id}

Get a specific organization.

#### PATCH /api/v2/organizations/{id}

Update an organization.

#### DELETE /api/v2/organizations/{id}

Delete an organization.

### Users

Manage users in your tenant.

#### GET /api/v2/users

List all users.

**Query Parameters:**

- `page`, `per_page`, `include_totals` - Pagination
- `sort` - Sort order
- `q` - Search query (supports `email:user@example.com`, `user_id:123`, etc.)

#### POST /api/v2/users

Create a new user.

#### GET /api/v2/users/{id}

Get a specific user.

#### PATCH /api/v2/users/{id}

Update a user.

#### DELETE /api/v2/users/{id}

Delete a user.

### Clients (Applications)

Manage OAuth clients/applications.

#### GET /api/v2/clients

List all clients.

#### POST /api/v2/clients

Create a new client.

#### GET /api/v2/clients/{id}

Get a specific client.

#### PATCH /api/v2/clients/{id}

Update a client.

#### DELETE /api/v2/clients/{id}

Delete a client.

### Connections

Manage authentication connections.

#### GET /api/v2/connections

List all connections.

#### POST /api/v2/connections

Create a new connection.

#### GET /api/v2/connections/{id}

Get a specific connection.

#### PATCH /api/v2/connections/{id}

Update a connection.

#### DELETE /api/v2/connections/{id}

Delete a connection.

### Roles

Manage user roles.

#### GET /api/v2/roles

List all roles.

#### POST /api/v2/roles

Create a new role.

#### GET /api/v2/roles/{id}

Get a specific role.

#### PATCH /api/v2/roles/{id}

Update a role.

#### DELETE /api/v2/roles/{id}

Delete a role.

### Resource Servers

Manage API resource servers.

#### GET /api/v2/resource-servers

List all resource servers.

#### POST /api/v2/resource-servers

Create a new resource server.

#### GET /api/v2/resource-servers/{id}

Get a specific resource server.

#### PATCH /api/v2/resource-servers/{id}

Update a resource server.

#### DELETE /api/v2/resource-servers/{id}

Delete a resource server.

### Other Endpoints

#### GET /api/v2/tenants

Manage tenant settings.

#### GET /api/v2/logs

Access audit logs.

#### GET /api/v2/sessions

Manage user sessions.

#### GET /api/v2/keys

Manage signing keys.

#### GET /api/v2/branding

Manage tenant branding.

#### GET /api/v2/custom-domains

Manage custom domains.

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
