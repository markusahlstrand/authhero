# API Endpoints

This document provides details on the available API endpoints in AuthHero.

## Authentication

### POST /api/v1/login

Initiates the login process.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password",
  "connection": "database"
}
```

**Response:**

```json
{
  "data": {
    "access_token": "...",
    "id_token": "...",
    "refresh_token": "...",
    "expires_in": 3600,
    "token_type": "Bearer"
  }
}
```

### POST /api/v1/signup

Registers a new user.

**Request Body:**

```json
{
  "email": "newuser@example.com",
  "password": "password",
  "connection": "database",
  "user_metadata": { ... }
}
```

**Response:**

```json
{
  "data": {
    "id": "user-123",
    "email": "newuser@example.com",
    "created_at": "2023-01-01T00:00:00.000Z",
    "updated_at": "2023-01-01T00:00:00.000Z"
  }
}
```

[Additional endpoints will be documented here]