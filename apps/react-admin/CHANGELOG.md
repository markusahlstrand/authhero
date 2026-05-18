# @authhero/react-admin

## 0.67.6

### Patch Changes

- 5a914ac: Add new `@authhero/admin` app at `apps/admin/` built with [shadcn-admin-kit](https://marmelab.com/shadcn-admin-kit/) (ra-core + shadcn/ui + Tailwind). It ports the full surface of `apps/react-admin` — tenants, users, clients, connections, custom domains, organizations, roles, actions, action-triggers, hooks, flows, forms, branding, prompts, resource servers + scopes, sessions, signing keys, attack protection, email providers, settings, logs, analytics — using idiomatic shadcn components. Specialized panels (client-grants management, FlowEditor/NodeEditor, Tiptap rich text, branding preview, action versions/test, log replay) ship as basic CRUD shells in this iteration. `apps/react-admin` is unchanged and will be removed once parity is reached.

  Run with `pnpm admin dev`.

- Updated dependencies [5e35511]
- Updated dependencies [5e35511]
  - @authhero/adapter-interfaces@2.2.0

## 0.67.5

### Patch Changes

- 63bf3a9: Split the client Connections tab into two sections: "Visible on Login Screen" (with reorder controls) and "Hidden Connections". Hidden lists connections that won't render as login buttons — `email`/`sms`/`Username-Password-Authentication` strategies (rendered as forms) and HRD connections with `domain_aliases` but `show_as_button !== true` — and removes the reorder buttons that have no effect on those. The Hidden section is omitted when empty.
- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
  - @authhero/adapter-interfaces@2.0.0

## 0.67.4

### Patch Changes

- 92774c8: Strip null values from `refresh_token` in the client edit form before PATCHing. The numeric fields (`leeway`, `token_lifetime`, `idle_token_lifetime`) are optional on the server and reject null — untouched fields that were null in the stored record were round-tripping back as null on submit and failing validation.
- 0539c2a: Fix repeated refresh-token calls on every navigation:
  - Dedupe in-flight access-token requests so concurrent API calls on a cold token cache share a single refresh-token exchange instead of each firing their own.
  - Fix the cached-token org-match check, which compared the org slug passed as `organization` against the JWT's `org_id` (the resolved id, not the slug). Every cache hit failed the guard and was evicted, forcing a refresh on every click. Now matches against either `org_id` or `org_name`.

## 0.67.3

### Patch Changes

- 1ea694f: OIDC connections can now choose how client credentials are sent to the upstream token endpoint via `options.token_endpoint_auth_method` (`client_secret_basic` — default — or `client_secret_post`). This fixes providers like JumpCloud that reject HTTP Basic auth at the token endpoint with `invalid_client`. The setting is editable in the react-admin connection form on the OIDC strategy.

  Under the hood the OIDC strategy uses `ExtendedOAuth2Client`, a small subclass of arctic's `OAuth2Client` (`strategies/internal-oauth2.ts`) that overrides `validateAuthorizationCode` for the `client_secret_post` path. Arctic's PKCE/URL/auth-URL logic and `OAuth2Tokens` shape are reused unchanged. Other strategies (Apple, Facebook, GitHub, Google, Microsoft, Vipps, generic OAuth2) still use arctic directly — they will be migrated in a follow-up PR.

- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
  - @authhero/adapter-interfaces@1.19.0

## 0.67.2

### Patch Changes

- e1c52f0: Fix branding URL fields (background image, logo, favicon, font URL) that couldn't be cleared from the admin UI. React-admin's default `TextInput` converts emptied input back to `null`, and `transformBranding` then strips null keys before submitting — so the PATCH body omitted the cleared field, which the server's deep-merge treats as "no change". The cleared value silently persisted. The clearable URL inputs in `branding/edit.tsx` and `branding/ThemesTab.tsx` now emit `""` instead of `null`, matching Auth0's PATCH semantics (omitted key = no change, empty string = clear).
- de79c2a: Connection callback URLs now match Auth0's default. Previously `getConnectionCallbackUrl` always returned `${env.ISSUER}callback` regardless of the request host. The fallback now returns `${customDomain ?? env.ISSUER}login/callback` — honoring custom domains and using Auth0's `/login/callback` path instead of the legacy `/callback`.

  Existing connections with the legacy `/callback` URL registered at the upstream IdP should be pinned by setting `options.callback_url` to the exact previously-implicit URL (e.g. `https://auth2.example.com/callback`) before deploying — otherwise the upstream IdP will reject the new redirect_uri. For inherited/control-plane connections this only needs to be set once on the control-plane row; child tenants pick it up via settings inheritance. The override is now editable in the react-admin connection form. The legacy `/callback` route remains mounted (deprecated) so pinned URLs keep working.

- e1c52f0: Fix client edit form sending `null` for cleared `refresh_token.leeway`, `refresh_token.token_lifetime`, and `refresh_token.idle_token_lifetime` fields. The API schema marks these as optional numbers (undefined OK, null rejected), so saving a client with any of them empty failed with `Expected number, received null`. The `NumberInput`s now parse empty/cleared values to `undefined` so the keys are omitted from the payload.

## 0.67.1

### Patch Changes

- b221917: Fix blank spinner on refresh of deep URLs in production.

  The Vite build emits relative asset paths (`./assets/index-*.js`) so the same bundle can be served from any base path. On Vercel — where nothing injects a `<base>` — refreshing a deep URL like `/:tenantId/users/abc` made the browser resolve `./assets/...` against the current path, hit the SPA catch-all rewrite, and get served `index.html` instead of the JS bundle, leaving the page stuck on the static loading spinner. Added `<base href="/" />` to `index.html` so the relative paths anchor to the origin. The Docker entrypoint still injects `<base href="/admin/" />` ahead of this one, and per HTML spec only the first `<base>` element is honored, so the `/admin` deployment is unaffected.

## 0.67.0

### Minor Changes

- 2ea1664: Expose bundled prompt text defaults via `GET /api/v2/prompts/custom-text/defaults`. Optional `language` and `prompt` query parameters narrow the response. The endpoint returns the shipped locale strings as `{ prompt, language, custom_text }` entries so the admin UI can render placeholder values and discover which prompt/screen forms exist without inferring them from per-tenant overrides. This is an authhero extension; Auth0 has no equivalent endpoint.

  The react-admin custom-text editor now consumes this endpoint: opening an entry pre-populates every shipped field for the prompt/language pair, shows the bundled default as the input placeholder and as `helperText`, and renders fields that the tenant hasn't overridden so admins can see the full surface area at a glance.

### Patch Changes

- 2ea1664: Fix org-scoped users getting 403 on tenant-scoped management API calls.
  - `createManagementClient` now passes the auth0 SDK a token supplier function instead of a captured token, so each SDK request resolves a fresh org-scoped token via `getOrgAccessToken` rather than reusing one captured at construction time.
  - The `isSingleTenant` sessionStorage check now requires the stored entry's domain prefix to match the current domain. Previously a stale `…|true` flag from any prior domain would steer multi-tenant requests to the non-org token path and pin a non-org token into the management client cache.
  - The same domain-aware check is applied in `dataProvider.ts` and `UniversalLoginTab.tsx`.

- Updated dependencies [2ea1664]
- Updated dependencies [2ea1664]
  - @authhero/adapter-interfaces@1.18.0

## 0.66.1

### Patch Changes

- 639ab29: Fix tenants list at the root showing only the user's current organization. The Auth0 SPA-JS cache is keyed on clientId+audience+scope (no org), so an org-scoped token from a prior tenant page could be returned for the non-org-scoped tenants request. Mirror the existing `orgTokenCache` with a `nonOrgTokenCache` and force `cacheMode: "off"` when fetching the non-org token.
- Updated dependencies [639ab29]
  - @authhero/adapter-interfaces@1.15.0

## 0.66.0

### Minor Changes

- 97454aa: Updated the listing of scopes in the resource server

### Patch Changes

- Updated dependencies [e5cbfe7]
- Updated dependencies [dd071e0]
  - @authhero/adapter-interfaces@1.10.3
  - @authhero/widget@0.32.10

## 0.65.1

### Patch Changes

- 6ddeedc: Render a human-readable label and success icon for the `seccft` (exchange access token for client credentials) log type.
- Updated dependencies [3230b9b]
  - @authhero/adapter-interfaces@1.10.2
  - @authhero/widget@0.32.9

## 0.65.0

### Minor Changes

- b324f77: Add sync resource server toggle

### Patch Changes

- Updated dependencies [ba03e14]
  - @authhero/adapter-interfaces@1.10.0
  - @authhero/widget@0.32.7

## 0.64.2

### Patch Changes

- 931f598: Add `GET /api/v2/users/{user_id}/logs` endpoint that returns log rows for the user and all of its linked secondary identities. Calling it with a secondary user_id returns 404, matching the convention used by the user PATCH endpoint.

  The react-admin user **Logs** tab now hits this endpoint, so it surfaces login activity from linked accounts (which the previous `q=user_id:…` query against `/logs` silently missed, since linked accounts are stored as separate user rows and each retains its own `user_id` on log entries).

- Updated dependencies [931f598]
  - @authhero/adapter-interfaces@1.5.0
  - @authhero/widget@0.32.2

## 0.64.1

### Patch Changes

- 6503423: Fix and extend log filtering on the admin logs page.
  - The `IP Address` filter on the logs list was sent as `?ip=<value>`, but the management API only accepts filters through the Lucene `q` parameter, so the filter was silently dropped. Non-`q` filter fields are now merged into `q` as `key:value` pairs (e.g. `q=ip:89.10.186.153`).
  - Added `Type` and `Status` (success/failure) select filters to the logs list.
  - The Cloudflare Analytics Engine adapter now understands the pseudo-filter `success:true|false` and translates it to a `blob3 LIKE 's%' | 'f%'` prefix match on the log type.

## 0.64.0

### Minor Changes

- d288b62: Add support for dynamic workers

### Patch Changes

- Updated dependencies [d288b62]
  - @authhero/widget@0.32.0

## 0.63.0

### Minor Changes

- 2f6354d: Make session lifetime cofigurable

### Patch Changes

- Updated dependencies [2f6354d]
  - @authhero/adapter-interfaces@1.3.0
  - @authhero/widget@0.31.3

## 0.62.0

### Minor Changes

- f662c3b: Add source maps

### Patch Changes

- f662c3b: Fix `Cannot read properties of undefined (reading 'mount')` crash on the Clients edit page.
  - Collapsed the dual-registered `client_metadata` path: `email_validation` and `disable_sign_ups` are now rendered inside `ClientMetadataInput` instead of as separate `SelectInput` / `BooleanInput` at `client_metadata.*`, so react-hook-form no longer sees the same path as both a leaf and a parent.
  - Added a `normalizeClient` `queryOptions.select` on the Edit view that defaults `client_metadata`, `addons`, and `addons.samlp` to empty objects when the stored record omits them or returns a non-object, keeping nested inputs (`addons.samlp.*`) safe.

## 0.61.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

### Patch Changes

- Updated dependencies [20d5140]
  - @authhero/adapter-interfaces@1.0.0
  - @authhero/widget@0.31.0

## 0.60.0

### Minor Changes

- a59a49b: Implement disable-sso

### Patch Changes

- Updated dependencies [a59a49b]
- Updated dependencies [4176937]
  - @authhero/adapter-interfaces@0.155.0
  - @authhero/widget@0.30.0

## 0.59.0

### Minor Changes

- af80757: Switch to use refresh-tokens

### Patch Changes

- Updated dependencies [884e950]
  - @authhero/adapter-interfaces@0.153.0
  - @authhero/widget@0.29.1

## 0.58.0

### Minor Changes

- 2f65572: Fix nested transactions
- 76f2b7f: Fix paging of clients in react-admin

## 0.57.0

### Minor Changes

- 885eeeb: Fix passkeys

### Patch Changes

- Updated dependencies [885eeeb]
  - @authhero/widget@0.29.0

## 0.56.0

### Minor Changes

- 164fe2c: Added passkeys

### Patch Changes

- Updated dependencies [164fe2c]
  - @authhero/adapter-interfaces@0.150.0
  - @authhero/widget@0.28.0

## 0.55.0

### Minor Changes

- 7c52f88: Fix setup guide bugs

### Patch Changes

- Updated dependencies [7c52f88]
  - @authhero/widget@0.27.0

## 0.54.0

### Minor Changes

- b3ad21f: Update setup with new ui

## 0.53.0

### Minor Changes

- d9c2ad1: Fixes to mfa-signup and new account screens

### Patch Changes

- Updated dependencies [d9c2ad1]
  - @authhero/widget@0.24.0

## 0.52.0

### Minor Changes

- 64e858a: Add mfa with logging

### Patch Changes

- Updated dependencies [64e858a]
  - @authhero/adapter-interfaces@0.149.0
  - @authhero/widget@0.23.0

## 0.51.0

### Minor Changes

- 469c395: Language refactor

### Patch Changes

- Updated dependencies [469c395]
  - @authhero/adapter-interfaces@0.148.0
  - @authhero/widget@0.22.0

## 0.50.0

### Minor Changes

- 5e73f56: Remove magic strings
- 5e73f56: Replace magic strings

### Patch Changes

- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
  - @authhero/adapter-interfaces@0.147.0
  - @authhero/widget@0.21.0

## 0.49.0

### Minor Changes

- 318fcf9: Update widget links
- 318fcf9: Update widget links

### Patch Changes

- Updated dependencies [409aa18]
- Updated dependencies [318fcf9]
- Updated dependencies [318fcf9]
  - @authhero/widget@0.20.0
  - @authhero/adapter-interfaces@0.146.0

## 0.48.0

### Minor Changes

- 30b5be1: Add support for set_user_root_attributes

### Patch Changes

- Updated dependencies [30b5be1]
  - @authhero/adapter-interfaces@0.145.0
  - @authhero/widget@0.19.2

## 0.47.0

### Minor Changes

- 39df1aa: Pass connection in credentials event
- 39df1aa: Change url of enter-code page
- 39df1aa: Hide secrets in react-admin

### Patch Changes

- Updated dependencies [39df1aa]
  - @authhero/adapter-interfaces@0.143.0
  - @authhero/widget@0.19.0

## 0.46.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

### Patch Changes

- Updated dependencies [1a72b93]
  - @authhero/adapter-interfaces@0.142.0
  - @authhero/widget@0.18.0

## 0.45.0

### Minor Changes

- 597eb2f: Show connection name in react-admin

### Patch Changes

- Updated dependencies [2617efb]
  - @authhero/adapter-interfaces@0.139.0
  - @authhero/widget@0.16.0

## 0.44.0

### Minor Changes

- 35691f6: Set custom domain metadata

## 0.43.0

### Minor Changes

- 818846d: Change to use auth0 instead of auth2

## 0.42.0

### Minor Changes

- d7bcd19: Add hook templates

### Patch Changes

- Updated dependencies [d7bcd19]
  - @authhero/adapter-interfaces@0.136.0
  - @authhero/widget@0.15.1

## 0.41.0

### Minor Changes

- 65321b7: Update for forms, flows and u2 login

### Patch Changes

- Updated dependencies [65321b7]
  - @authhero/adapter-interfaces@0.135.0
  - @authhero/widget@0.15.0

## 0.40.0

### Minor Changes

- de5974b: Update u2 login and flows

## 0.39.0

### Minor Changes

- 00e9cf7: Add support for forms in the u2 login

### Patch Changes

- Updated dependencies [00e9cf7]
  - @authhero/widget@0.14.0

## 0.38.0

### Minor Changes

- a5c1ba9: Add mfa signup

### Patch Changes

- Updated dependencies [a5c1ba9]
  - @authhero/adapter-interfaces@0.134.0
  - @authhero/widget@0.13.3

## 0.37.0

### Minor Changes

- 2e08bfa: Add support for password first

## 0.36.0

### Minor Changes

- 73f12a9: Fix refresh of sub path

## 0.35.0

### Minor Changes

- 131ea43: Add more node fields

### Patch Changes

- Updated dependencies [131ea43]
  - @authhero/adapter-interfaces@0.132.0
  - @authhero/widget@0.13.1

## 0.34.0

### Minor Changes

- c5935bd: Update the new widget endpoints

### Patch Changes

- Updated dependencies [c5935bd]
  - @authhero/adapter-interfaces@0.131.0
  - @authhero/widget@0.13.0

## 0.33.0

### Minor Changes

- bf22ac7: Add support for inlang

### Patch Changes

- Updated dependencies [bf22ac7]
  - @authhero/widget@0.11.0

## 0.32.0

### Minor Changes

- 44b76d9: Update the custom text behaviour

### Patch Changes

- Updated dependencies [44b76d9]
  - @authhero/widget@0.10.0

## 0.31.0

### Minor Changes

- ac8af37: Add custom text support

### Patch Changes

- Updated dependencies [88a03cd]
- Updated dependencies [ac8af37]
  - @authhero/widget@0.9.0
  - @authhero/adapter-interfaces@0.130.0

## 0.30.0

### Minor Changes

- 6585906: Move universal login templates to separate adapter

### Patch Changes

- Updated dependencies [6585906]
  - @authhero/adapter-interfaces@0.128.0
  - @authhero/widget@0.8.5

## 0.29.0

### Minor Changes

- de7cb56: Use https for local dev
- 154993d: Improve react-admin experience by clearing caches and setting cores

### Patch Changes

- Updated dependencies [154993d]
  - @authhero/adapter-interfaces@0.126.0
  - @authhero/widget@0.8.3

## 0.28.0

### Minor Changes

- 2d0a7f4: Add a auth0-conformance flag

### Patch Changes

- Updated dependencies [2d0a7f4]
  - @authhero/adapter-interfaces@0.123.0
  - @authhero/widget@0.7.2

## 0.27.0

### Minor Changes

- 76510cd: Fixes for branding page and endpoint

## 0.26.0

### Minor Changes

- c89fb59: Skip dialog if there is a env varitable for environment

## 0.25.0

### Minor Changes

- 7bf78f7: Add deploy buttons for react-admin

## 0.24.0

### Minor Changes

- 9d6cfb8: Wrap adapters as part of the multi-tenant package

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0
  - @authhero/widget@0.7.1

## 0.23.0

### Minor Changes

- 7277798: Improve logging for changing emails

## 0.22.0

### Minor Changes

- 00d2f83: Update versions to get latest build

### Patch Changes

- Updated dependencies [00d2f83]
  - @authhero/adapter-interfaces@0.120.0
  - @authhero/widget@0.6.3

## 0.21.0

### Minor Changes

- 1423254: Fix casing in the ui for organizations

## 0.20.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0
  - @authhero/widget@0.6.0

## 0.19.0

### Minor Changes

- 47fe928: Refactor create authhero
- f4b74e7: Add widget to react-admin

### Patch Changes

- Updated dependencies [f4b74e7]
- Updated dependencies [b6d3411]
  - @authhero/widget@0.5.0

## 0.18.0

### Minor Changes

- 928d358: Add userinfo hook

## 0.17.0

### Minor Changes

- c8c83e3: Add a admin:organizations permission to hande organizations in the control_plane

## 0.16.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries
- e542773: Fixes for syncing resources servers and global roles

## 0.15.0

### Minor Changes

- aaf0aa0: Fix paging issue for scopes

## 0.14.0

### Minor Changes

- 63f9c89: Remove requirement for password users to have verified emails
- 63f9c89: Fix the listing of logs for a user

## 0.13.0

### Minor Changes

- 0f8e4e8: Change from main to control plane
- 3a180df: Fix organization names for main tenant

## 0.12.0

### Minor Changes

- aba8ef9: Handle org tokens for the main tenant

## 0.11.0

### Minor Changes

- 1c36752: Use org tokens for tenants in admin

## 0.10.0

### Minor Changes

- 283daf2: Refactor multi-tenancy package
- ae8553a: Add is_system to all adapters

## 0.9.0

### Minor Changes

- 100b1bd: Patch the redirect action for flows

## 0.8.0

### Minor Changes

- 9e34783: Sync resource servers for multi tenancy setup

## 0.7.0

### Minor Changes

- 906337d: Add flows support

## 0.6.0

### Minor Changes

- a108525: Add flows

## 0.5.0

### Minor Changes

- 1bec131: Add stats endpoints and activity view

## 0.4.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 0.3.0

### Minor Changes

- 6929f98: Improve the create authhero for local

## 0.2.0

### Minor Changes

- 23e56b0: Update the logs list view
