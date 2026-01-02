---
title: API Overview
description: Overview of the AuthHero API including authentication methods, base URLs, response formats, rate limiting, and versioning.
---

# API Overview

This document provides an overview of the AuthHero API.

## Authentication

All API requests require authentication. There are two ways to authenticate:

1. **Bearer Token**: Include an access token in the `Authorization` header
2. **API Key**: Include an API key in the `X-API-Key` header

## Base URL

The base URL for API requests depends on your AuthHero configuration:

- Default: `https://api.yourdomain.com`
- Custom domain: `https://auth.yourdomain.com`

## Response Format

All API responses are in JSON format and include a standard structure:

```json
{
  "data": { ... },  // Response data (if successful)
  "error": { ... }  // Error details (if an error occurred)
}
```

## Rate Limiting

[Rate limiting details will be documented here]

## Versioning

The API is versioned to ensure backward compatibility. The current version is accessible at `/api/v1/`.

## Endpoints

See the [Endpoints](endpoints.md) page for a complete list of available API endpoints.

## Forms

For details on the forms system, including form structure, components, and implementation, see the [Forms](forms.md) documentation.

## Flows

For details on the flows system, including action types, execution logic, and redirect actions, see the [Flows](flows.md) documentation.

## Error Handling

See the [Error Codes](error-codes.md) page for details on error responses and status codes.
