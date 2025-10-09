# GitHub and Microsoft Authentication Setup

This guide explains how to configure GitHub and Microsoft authentication strategies in AuthHero.

## GitHub Authentication

### Prerequisites

1. Create a GitHub OAuth App:
   - Go to https://github.com/settings/developers
   - Click "New OAuth App"
   - Fill in the application details:
     - **Application name**: Your application name
     - **Homepage URL**: Your application URL
     - **Authorization callback URL**: `https://yourdomain.com/callback`
   - Click "Register application"
   - Copy the **Client ID**
   - Generate a new **Client Secret** and copy it

### Configuration

Create a connection in AuthHero with the following settings:

```json
{
  "name": "github",
  "strategy": "github",
  "options": {
    "client_id": "your_github_client_id",
    "client_secret": "your_github_client_secret",
    "scope": "user:email"
  },
  "enabled_clients": ["your_client_id"]
}
```

### Scope Options

GitHub OAuth supports various scopes. Common ones for authentication:

- `user:email` - Read user email addresses (required for authentication)
- `read:user` - Read all user profile data
- `user` - Full access to user profile

For most authentication use cases, `user:email` is sufficient.

### User Data

The GitHub strategy returns:

- `sub` - GitHub user ID (as string)
- `email` - Primary verified email address
- `name` - Full name (if provided)
- `given_name` - First name (parsed from full name)
- `family_name` - Last name (parsed from full name)
- `picture` - Avatar URL

### Notes

- The strategy automatically fetches the user's verified email addresses
- If multiple verified emails exist, it prioritizes the primary email
- GitHub API requires a User-Agent header (handled automatically)

---

## Microsoft Authentication (Entra ID)

### Prerequisites

1. Create an Azure AD App Registration:
   - Go to https://portal.azure.com
   - Navigate to "Azure Active Directory" → "App registrations"
   - Click "New registration"
   - Fill in the application details:
     - **Name**: Your application name
     - **Supported account types**: Choose based on your needs (see Tenant Types below)
     - **Redirect URI**: Select "Web" and enter `https://yourdomain.com/callback`
   - Click "Register"
   - Copy the **Application (client) ID**
   - Copy the **Directory (tenant) ID** (if using single-tenant)
   - Go to "Certificates & secrets" → "New client secret"
   - Create a secret and copy its value immediately

### Configuration

Create a connection in AuthHero with the following settings:

```json
{
  "name": "microsoft",
  "strategy": "microsoft",
  "options": {
    "client_id": "your_azure_client_id",
    "client_secret": "your_azure_client_secret",
    "realms": "common",
    "scope": "openid profile email"
  },
  "enabled_clients": ["your_client_id"]
}
```

### Tenant Types (`realms` option)

The `realms` field determines which types of accounts can sign in:

- **`common`** (default) - Both organizational and personal Microsoft accounts
- **`organizations`** - Only organizational accounts (work/school)
- **`consumers`** - Only personal Microsoft accounts (outlook.com, hotmail.com, etc.)
- **`{tenant-id}`** - Specific tenant only (use your Directory/Tenant ID)
- **`{domain}.onmicrosoft.com`** - Specific tenant by domain name

Example for single-tenant:

```json
{
  "realms": "12345678-1234-1234-1234-123456789012"
}
```

### Scope Options

Microsoft identity platform supports various scopes:

- `openid` - Required for OpenID Connect
- `profile` - Access to user's profile information
- `email` - Access to user's email address
- `offline_access` - Refresh tokens for long-lived sessions

The default `openid profile email` is recommended for most cases.

### User Data

The Microsoft strategy returns:

- `sub` - Microsoft user ID (unique identifier)
- `email` - User's email address
- `name` - Full name
- `given_name` - First name
- `family_name` - Last name
- `picture` - Profile picture URL (if available)

### Security Features

- Uses PKCE (Proof Key for Code Exchange) for enhanced security
- Returns ID token with verified user claims
- Supports both work/school and personal Microsoft accounts

### Notes

- Make sure to add the redirect URI in your Azure AD app registration
- The redirect URI must exactly match (including trailing slashes)
- For production, use HTTPS callback URLs
- Client secrets expire - set reminders to rotate them

---

## Testing

You can test both strategies in Storybook:

```bash
pnpm run storybook
```

Navigate to:

- **Components → IdentifierForm → Multiple Social Connections** - Shows all providers including GitHub and Microsoft
- **Components → IdentifierForm → Developer Social Logins** - Focuses on GitHub and Microsoft

---

## Troubleshooting

### GitHub Issues

**"Failed to fetch user info"**

- Verify your client ID and secret are correct
- Check that the callback URL matches exactly
- Ensure the OAuth app is not suspended

**"No email returned"**

- User may not have a verified email on GitHub
- User's email may be set to private in GitHub settings
- Request the `user:email` scope

### Microsoft Issues

**"AADSTS50011: The reply URL specified in the request does not match"**

- Add the exact callback URL to Azure AD app registration
- Check for trailing slashes and protocol (http vs https)

**"AADSTS700016: Application not found"**

- Verify the client ID is correct
- Ensure the app is enabled in Azure AD

**"AADSTS65001: The user or administrator has not consented"**

- Required permissions may not be granted
- Admin consent may be required for your organization

**"Invalid code verifier"**

- This shouldn't happen with Arctic library
- Check that sessions are being maintained properly

---

## Example: Full Connection Setup

### GitHub Connection

```typescript
const githubConnection = {
  id: "con_github123",
  name: "github",
  strategy: "github",
  options: {
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    scope: "user:email",
  },
  enabled_clients: ["app_client_id"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```

### Microsoft Connection (Multi-tenant)

```typescript
const microsoftConnection = {
  id: "con_microsoft123",
  name: "microsoft",
  strategy: "microsoft",
  options: {
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    realms: "common",
    scope: "openid profile email",
  },
  enabled_clients: ["app_client_id"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```

### Microsoft Connection (Single-tenant)

```typescript
const microsoftConnection = {
  id: "con_microsoft123",
  name: "microsoft-corporate",
  strategy: "microsoft",
  options: {
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    realms: "12345678-1234-1234-1234-123456789012", // Your tenant ID
    scope: "openid profile email",
  },
  enabled_clients: ["app_client_id"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```
