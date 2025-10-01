# Authhero

Authhero is an open-source authentication library designed as a drop-in replacement for Auth0. It provides a fully functional auth server that you can set up in minutes.

## Getting Started

Set up a new project with Authhero in 5 minutes or less:

```bash
npx create authhero
```

Alternatively, you can install the npm packages into an existing project and integrate Authhero with your existing setup.

## Installation

Authhero consists of several npm packages that provide different authentication-related functionalities. The package includes four Hono routers, each handling a different aspect of the auth server:

- **Management API (`management-api`)**: Exposes endpoints for managing authentication data, compatible with Auth0's `/api/v2`.
- **Auth API (`auth-api`)**: Implements OAuth2/OIDC endpoints for user authentication.
- **Universal Auth (`universal-auth`)**: Provides a server-side rendered UI for login.
- **SAML App (`saml-app`)**: Handles SAML authentication endpoints.

## Creating a New Auth Server

To initialize an auth server using Authhero:

```javascript
const { managementApp, oauthApp, universalApp, samlApp } = init({
  dataAdapter: params.dataAdapter,
});

rootApp
  .route("/", oauthApp)
  .route("/u", universalApp)
  .route("/api/v2", managementApp)
  .route("/", samlApp);
```

## Data Adapters

Authhero uses data adapters to handle persistence. The default adapter is `@authhero/kysely`, which connects to any SQL database using Kysely. Future versions will migrate to Drizzle as the default data adapter. You can also create custom adapters, such as DynamoDB + Elasticsearch.

## Hooks

Authhero supports hooks to customize authentication logic. For example, you can grant roles dynamically using the `onExecuteCredentialsExchange` hook:

```javascript
hooks: {
  onExecuteCredentialsExchange: async (
    event: OnExecuteCredentialsExchangeEvent,
    api: OnExecuteCredentialsExchangeAPI,
  ) => {
    if (event.client.client_id === "sampleClient") {
      api.accessToken.setCustomClaim("roles", "admin");
    }
  }
},
```

### Supported Hooks

- `onExecuteCredentialsExchange`
- `onExecutePreUserRegistration`
- `onExecutePostUserRegistration`
- `onExecutePostLogin`

## Email Providers

Authhero supports email providers for sending authentication-related emails. You can use pre-built email provider packages or configure a custom provider. Example:

```javascript
emailProviders: {
  sqs: sendSqsEmail,
},
```

## Contributing

Contributions are welcome! Feel free to open issues and submit pull requests to improve Authhero.

## License

Authhero is open-source and available under the MIT License.

## Using Tailwind CSS with authhero components

There are two ways to use the Tailwind CSS styles with authhero components:

### 1. Import the CSS file (for environments with filesystem access)

```js
// Import the CSS
import "authhero/styles";

// Then use the components
import { Button, Form } from "authhero";
```

### 2. Inject CSS programmatically (for Cloudflare Workers and similar environments)

For environments that don't support filesystem access, you can inject the CSS programmatically:

```js
// Import the helper function
import { injectTailwindCSS } from "authhero";

// Call this function once to inject the CSS into the document
injectTailwindCSS();

// Then use the components
import { Button, Form } from "authhero";
```

You can also access the raw CSS string:

```js
import { tailwindCss } from "authhero";

// Use the CSS string as needed
// For example, in a Cloudflare Worker:
const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <style>${tailwindCss}</style>
    </head>
    <body>
      <!-- Your content -->
    </body>
  </html>
`;
```
