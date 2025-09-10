# Organizations API Endpoints

The Organizations API provides endpoints to manage organizations within a tenant in AuthHero.

## Base URL

All organization endpoints are under `/api/v2/organizations` in the Management API.

## Authentication

All endpoints require a Bearer token with appropriate scopes:

- Read operations: `auth:read`
- Write operations: `auth:write`

## Headers

All requests must include:

- `Authorization: Bearer <token>`
- `tenant-id: <tenant_id>`

## Endpoints

### GET /api/v2/organizations

Lists all organizations for a tenant.

**Query Parameters:**

- `page` (optional): Page number for pagination
- `per_page` (optional): Number of results per page (default: 10)
- `include_totals` (optional): Include pagination totals (default: false)
- `sort` (optional): Sort field and order (e.g., "name:asc")
- `q` (optional): Search query

**Response:**

```json
[
  {
    "id": "org_123",
    "name": "Acme Corporation",
    "display_name": "Acme Corp",
    "branding": {
      "logo_url": "https://acme.com/logo.png",
      "colors": {
        "primary": "#1E40AF",
        "page_background": "#F8FAFC"
      }
    },
    "metadata": {
      "industry": "Technology"
    },
    "enabled_connections": [
      {
        "connection_id": "google-oauth2",
        "assign_membership_on_login": true,
        "show_as_button": true,
        "is_signup_enabled": true
      }
    ],
    "token_quota": {
      "client_credentials": {
        "enforce": true,
        "per_day": 10000,
        "per_hour": 1000
      }
    },
    "created_at": "2025-09-10T10:00:00.000Z",
    "updated_at": "2025-09-10T10:00:00.000Z"
  }
]
```

### GET /api/v2/organizations/{id}

Gets a specific organization by ID.

**Path Parameters:**

- `id`: Organization ID

**Response:**

```json
{
  "id": "org_123",
  "name": "Acme Corporation",
  "display_name": "Acme Corp",
  "branding": {
    "logo_url": "https://acme.com/logo.png",
    "colors": {
      "primary": "#1E40AF",
      "page_background": "#F8FAFC"
    }
  },
  "metadata": {
    "industry": "Technology"
  },
  "enabled_connections": [
    {
      "connection_id": "google-oauth2",
      "assign_membership_on_login": true,
      "show_as_button": true,
      "is_signup_enabled": true
    }
  ],
  "token_quota": {
    "client_credentials": {
      "enforce": true,
      "per_day": 10000,
      "per_hour": 1000
    }
  },
  "created_at": "2025-09-10T10:00:00.000Z",
  "updated_at": "2025-09-10T10:00:00.000Z"
}
```

### POST /api/v2/organizations

Creates a new organization.

**Request Body:**

```json
{
  "name": "Acme Corporation",
  "display_name": "Acme Corp",
  "branding": {
    "logo_url": "https://acme.com/logo.png",
    "colors": {
      "primary": "#1E40AF",
      "page_background": "#F8FAFC"
    }
  },
  "metadata": {
    "industry": "Technology"
  },
  "enabled_connections": [
    {
      "connection_id": "google-oauth2",
      "assign_membership_on_login": true,
      "show_as_button": true,
      "is_signup_enabled": true
    }
  ],
  "token_quota": {
    "client_credentials": {
      "enforce": true,
      "per_day": 10000,
      "per_hour": 1000
    }
  }
}
```

**Response:** Returns the created organization with generated `id`, `created_at`, and `updated_at` fields.

### PATCH /api/v2/organizations/{id}

Updates an existing organization.

**Path Parameters:**

- `id`: Organization ID

**Request Body:**

```json
{
  "display_name": "Updated Display Name",
  "branding": {
    "colors": {
      "primary": "#DC2626"
    }
  }
}
```

**Response:** Returns the updated organization.

### DELETE /api/v2/organizations/{id}

Deletes an organization.

**Path Parameters:**

- `id`: Organization ID

**Response:** 200 OK with "OK" text body.

## Field Descriptions

- `id`: Unique identifier for the organization (auto-generated)
- `name`: Required. The name of the organization
- `display_name`: Optional. Display name for the organization
- `branding`: Optional. Branding configuration
  - `logo_url`: Optional. URL of the organization's logo
  - `colors`: Optional. Color scheme
    - `primary`: Optional. Primary color in hex format
    - `page_background`: Optional. Background color in hex format
- `metadata`: Optional. Custom metadata object for storing additional data
- `enabled_connections`: Optional. Array of enabled connections
  - `connection_id`: Required. ID of the connection
  - `assign_membership_on_login`: Optional. Whether to assign membership on login (default: false)
  - `show_as_button`: Optional. Whether to show as button in login UI (default: true)
  - `is_signup_enabled`: Optional. Whether signup is enabled (default: true)
- `token_quota`: Optional. Token quota configuration
  - `client_credentials`: Optional. Client credentials quota
    - `enforce`: Optional. Whether to enforce quotas (default: false)
    - `per_day`: Optional. Daily token limit (default: 0 = unlimited)
    - `per_hour`: Optional. Hourly token limit (default: 0 = unlimited)
- `created_at`: Timestamp when the organization was created (auto-generated)
- `updated_at`: Timestamp when the organization was last updated (auto-generated)

## Error Responses

- `404 Not Found`: Organization not found
- `401 Unauthorized`: Invalid or missing authentication token
- `403 Forbidden`: Insufficient permissions
- `400 Bad Request`: Invalid request data

## Example Usage

### Create an organization with cURL

```bash
curl -X POST https://your-domain.com/api/v2/organizations \
  -H "Authorization: Bearer your-token" \
  -H "tenant-id: your-tenant-id" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Organization",
    "display_name": "My Org",
    "metadata": {
      "department": "Engineering"
    }
  }'
```

### List organizations with JavaScript

```javascript
const response = await fetch("/api/v2/organizations", {
  headers: {
    Authorization: `Bearer ${token}`,
    "tenant-id": tenantId,
  },
});

const organizations = await response.json();
console.log(organizations);
```
