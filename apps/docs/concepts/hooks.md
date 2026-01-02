# Hooks

Hooks are a powerful extensibility mechanism that allows you to customize the authentication and user lifecycle at various points. AuthHero supports both URL-based webhooks and programmatic hooks defined in code.

## Types of Hooks

### Programmatic Hooks

Defined directly in your application code during initialization. These provide synchronous, server-side customization capabilities:

- `onExecutePreUserRegistration` - Before a user is created
- `onExecutePostUserRegistration` - After a user is created
- `onExecutePreUserUpdate` - Before a user is updated
- `onExecutePreUserDeletion` - Before a user is deleted (AuthHero-specific)
- `onExecutePostUserDeletion` - After a user is deleted (AuthHero-specific)
- `onExecutePostLogin` - After successful authentication
- `onExecuteCredentialsExchange` - Before tokens are issued

**Example:**

```typescript
import { Authhero } from "authhero";

const auth = new Authhero({
  hooks: {
    onExecutePreUserRegistration: async (user, ctx) => {
      // Validate user data
      if (!user.email.endsWith("@company.com")) {
        throw new Error("Only company emails allowed");
      }
      
      // Enrich user profile
      user.app_metadata = {
        department: "sales",
        onboarding_completed: false,
      };
      
      return user;
    },
    
    onExecutePostLogin: async (user, ctx) => {
      // Log authentication event
      await analytics.track("user_login", {
        user_id: user.user_id,
        ip_address: ctx.ip,
      });
    },
  },
});
```

### URL Hooks

Configured through the Management API to call external webhooks at specific trigger points.

```typescript
POST /api/v2/hooks
{
  "name": "Post-Login Analytics",
  "triggerId": "post-login",
  "url": "https://api.example.com/auth/post-login",
  "enabled": true,
  "secrets": {
    "API_KEY": "secret_key_123"
  }
}
```

When the hook triggers, AuthHero sends a POST request to your URL with event data.

### Form Hooks

Unique to AuthHero, form hooks render custom forms directly in the authentication flow for progressive profiling or consent gathering.

```typescript
{
  "triggerId": "post-login",
  "form": {
    "title": "Complete Your Profile",
    "fields": [
      {
        "name": "company",
        "label": "Company Name",
        "type": "text",
        "required": true
      },
      {
        "name": "role",
        "label": "Job Role",
        "type": "select",
        "options": ["Developer", "Designer", "Manager"]
      }
    ]
  }
}
```

## Hook Context

Hooks receive contextual information about the authentication event:

```typescript
interface HookContext {
  tenant_id: string;
  client_id: string;
  connection: string;
  ip: string;
  user_agent: string;
  request: {
    query: Record<string, string>;
    body: Record<string, any>;
  };
}
```

## Use Cases

### User Validation

Validate user data before account creation:

```typescript
onExecutePreUserRegistration: async (user) => {
  // Check email domain
  if (!isAllowedDomain(user.email)) {
    throw new Error("Email domain not allowed");
  }
  
  // Check for existing account in external system
  const exists = await externalSystem.checkUser(user.email);
  if (exists) {
    throw new Error("Account already exists in main system");
  }
  
  return user;
}
```

### User Enrichment

Add metadata from external systems:

```typescript
onExecutePostUserRegistration: async (user) => {
  // Fetch additional data from CRM
  const crmData = await crm.getUserData(user.email);
  
  // Update user metadata
  await auth.users.update(user.tenant_id, user.user_id, {
    app_metadata: {
      crm_id: crmData.id,
      account_tier: crmData.tier,
    },
  });
}
```

### Custom Claims

Add custom claims to tokens:

```typescript
onExecuteCredentialsExchange: async (ctx) => {
  const user = ctx.user;
  
  return {
    customClaims: {
      "https://example.com/department": user.app_metadata.department,
      "https://example.com/roles": user.app_metadata.roles,
    },
  };
}
```

### Analytics and Monitoring

Track authentication events:

```typescript
onExecutePostLogin: async (user, ctx) => {
  await analytics.track("user_login", {
    user_id: user.user_id,
    ip_address: ctx.ip,
    user_agent: ctx.user_agent,
    connection: ctx.connection,
  });
  
  // Alert on suspicious activity
  if (await isSuspicious(user, ctx)) {
    await security.alert("Suspicious login detected", { user, ctx });
  }
}
```

## Key Differences from Auth0

- **User Deletion Hooks**: AuthHero provides both pre and post deletion hooks, which Auth0 doesn't offer natively
- **Form Hooks**: AuthHero can render custom forms directly in the authentication flow
- **Continued Support**: While Auth0 deprecated their legacy Hooks in 2024, AuthHero continues to support and expand this functionality

[Learn more about Hooks implementation →](/auth0-comparison/hooks)

## API Reference

- [GET /api/v2/hooks](/api/endpoints#get-hooks)
- [POST /api/v2/hooks](/api/endpoints#create-hook)
- [PATCH /api/v2/hooks/:id](/api/endpoints#update-hook)
- [DELETE /api/v2/hooks/:id](/api/endpoints#delete-hook)
