# Demo App Usage

## Authentication Endpoints

The demo app exposes several authentication endpoints:

- `/login` - Initiates the login process
- `/callback` - Handles the callback after successful authentication
- `/logout` - Logs out the user
- `/signup` - Registers a new user
- `/api/me` - Returns the profile of the authenticated user

## Testing Authentication Flow

### Login Flow

1. Navigate to `http://localhost:8787/login`
2. Enter credentials (default user: `test@example.com`, password: `password`)
3. After successful authentication, you'll be redirected to the callback URL

### API Access

Access protected API endpoints using the token obtained during authentication:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" http://localhost:8787/api/me
```

## Database Exploration

The SQLite database contains several tables:

- `users` - User information
- `applications` - Registered applications
- `connections` - Authentication connection methods
- `domains` - Custom domains
- `tokens` - Authentication tokens

You can explore the database using the SQLite command line or a GUI tool like SQLite Browser.

## Customization

[Instructions for customizing the demo app will go here]