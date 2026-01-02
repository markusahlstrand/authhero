---
title: Error Codes
description: Reference guide for AuthHero API error codes including HTTP status codes, authentication errors, and user-related error responses.
---

# Error Codes

This document provides a reference for error codes returned by the AuthHero API.

## Error Response Format

When an error occurs, the API responds with an appropriate HTTP status code and a JSON object containing error details:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable error message",
    "details": { ... }  // Optional additional error details
  }
}
```

## Common HTTP Status Codes

- `400 Bad Request`: The request was invalid or cannot be served
- `401 Unauthorized`: Authentication is required or failed
- `403 Forbidden`: The authenticated user doesn't have permission
- `404 Not Found`: The requested resource doesn't exist
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: An error occurred on the server

## Authentication Error Codes

- `invalid_credentials`: The provided credentials are invalid
- `invalid_token`: The provided token is invalid or expired
- `invalid_refresh_token`: The provided refresh token is invalid or expired
- `invalid_grant`: The provided authorization grant is invalid

## User Error Codes

- `user_exists`: A user with the provided email already exists
- `user_not_found`: The requested user doesn't exist
- `password_too_weak`: The provided password doesn't meet strength requirements
- `password_history_conflict`: The new password has been used recently

[Additional error codes will be documented here]