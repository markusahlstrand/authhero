---
"@authhero/adapter-interfaces": major
"authhero": major
---

Split the `microsoft` strategy into Auth0's two canonical strategies: `windowslive` (Microsoft Account / consumer) and `waad` (Azure AD / enterprise). Both share the same Microsoft Identity Platform v2.0 OAuth handler internally but register under distinct strategy names so user_ids match Auth0's wire format (`windowslive|<sub>` for consumer logins, `waad|<oid>` for enterprise). `Strategy.MICROSOFT` is removed from the enum. `getProviderFromConnection` now always returns the strategy name — previously enterprise strategies (`oidc`, `samlp`, `waad`, `adfs`, `oauth2`) returned the connection name, which diverged from Auth0's `<strategy>|<conn>|<sub>` user_id format. **Breaking**: existing connection rows with `strategy = 'microsoft'` and any users with `<connection-name>|...` ids on enterprise connections will need a one-time DB migration.
