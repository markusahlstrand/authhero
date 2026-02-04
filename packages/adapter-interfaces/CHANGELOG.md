# @authhero/adapter-interfaces

## 0.130.0

### Minor Changes

- ac8af37: Add custom text support

## 0.129.0

### Minor Changes

- a8e70e6: Update schemas to remove old fallbacks

## 0.128.0

### Minor Changes

- 6585906: Move universal login templates to separate adapter

## 0.127.0

### Minor Changes

- fd374a9: Set theme id
- 8150432: Replaced legacy client

## 0.126.0

### Minor Changes

- 154993d: Improve react-admin experience by clearing caches and setting cores

## 0.125.0

### Minor Changes

- 491842a: Bump packages to make sure the universal_login_templates is available

## 0.124.0

### Minor Changes

- 2af900c: Create a per user session cleanup
- 2be02f8: Add dynamic liquid templates

## 0.123.0

### Minor Changes

- 2d0a7f4: Add a auth0-conformance flag

## 0.122.0

### Minor Changes

- 9d6cfb8: Wrap adapters as part of the multi-tenant package

## 0.121.0

### Minor Changes

- 2853db0: Only show the selected connections for a client
- 967d470: Add a metadata field to roles and resource-servers

## 0.120.0

### Minor Changes

- 00d2f83: Update versions to get latest build

## 0.119.0

### Minor Changes

- 8ab8c0b: Start adding xstate

## 0.118.0

### Minor Changes

- b7bb663: Make organizations lowercase

## 0.117.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

## 0.116.0

### Minor Changes

- 9c15354: Remove shadcn and updated widget

## 0.115.0

### Minor Changes

- f738edf: Add checkpoint pagination for organizations

## 0.114.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries
- e542773: Fixes for syncing resources servers and global roles

## 0.113.0

### Minor Changes

- d967833: Add a stencil-js widget for login

## 0.112.0

### Minor Changes

- ae8553a: Add is_system to all adapters

## 0.111.0

### Minor Changes

- 906337d: Add flows support

## 0.110.0

### Minor Changes

- a108525: Add flows

## 0.109.0

### Minor Changes

- 1bec131: Add stats endpoints and activity view

## 0.108.0

### Minor Changes

- 0e906aa: Generalize the base adapter

## 0.107.0

### Minor Changes

- 212f5c6: Update the connection schema for password strength

## 0.106.0

### Minor Changes

- f37644f: Update the node types for the forms

## 0.105.0

### Minor Changes

- 40caf1a: Add support for different connections for different clients. And support sorting.

## 0.104.0

### Minor Changes

- 125dbb9: Flow updates

## 0.103.0

### Minor Changes

- b0c4421: Add oidc and icon_url
- c96d83b: Added dispaly name on connections

## 0.102.0

### Minor Changes

- 0566155: Get provider from connection
- 0566155: Remove country 3 and country name fields

## 0.101.0

### Minor Changes

- 0ffb5ca: Add support for password strength

## 0.100.0

### Minor Changes

- 3a0d8ee: Add geo info

## 0.99.0

### Minor Changes

- a3c69f0: Add support for logs with cloudflare sql

## 0.98.0

### Minor Changes

- 6067f00: Update the hook names

## 0.97.0

### Minor Changes

- Update the logs schemas

## 0.96.0

### Minor Changes

- Added invites

## 0.95.0

### Minor Changes

- Merge settings and tenants table

## 0.94.0

### Minor Changes

- Add settings endpoint

## 0.93.0

### Minor Changes

- Add new events and update chadcn layout

## 0.92.0

### Minor Changes

- Remove disable signup from legacy client

## 0.91.0

### Minor Changes

- 149ab91: Drop the old application table
- b0e9595: Add client grants

## 0.90.0

### Minor Changes

- Update to use new clients

## 0.89.0

### Minor Changes

- Create new clients table

## 0.88.0

### Minor Changes

- Changed to LegacyClient as a first step in the refactor

## 0.87.0

### Minor Changes

- Get organizations crud working like auth0

## 0.86.0

### Minor Changes

- Add users to organizations

## 0.85.0

### Minor Changes

- Added organizations

## 0.84.0

### Minor Changes

- Add cache adapter

## 0.83.0

### Minor Changes

- Add type to keys

## 0.82.0

### Minor Changes

- Add user roles

## 0.81.0

### Minor Changes

- fc8153d: Update structure and endpoints

## 0.80.0

### Minor Changes

- Add roles

## 0.79.0

### Minor Changes

- Add resource servers, rules and permissions

## 0.78.0

### Minor Changes

- Remove vendorsettings

## 0.77.0

### Minor Changes

- Add client_metadata to client type

## 0.76.0

### Minor Changes

- Update the themes entity

## 0.75.0

### Minor Changes

- Add themes endpoints

## 0.74.0

### Minor Changes

- Refactor log types

## 0.73.0

### Minor Changes

- Use countrycode from vendor settings if available

## 0.72.0

### Minor Changes

- Add text form component

## 0.71.0

### Minor Changes

- Preserve app_metadata fields during /u/check-account; guard updating app_metadata.strategy; add test.

## 0.70.0

### Minor Changes

- Added state and nonce to codes

## 0.69.0

### Minor Changes

- Add redirect_uri to codes

## 0.68.0

### Minor Changes

- Add code_challenge to codes table

## 0.67.0

### Minor Changes

## 0.66.0

### Minor Changes

- Add a login_completed flag to the login sessions

## 0.65.0

### Minor Changes

- Add a form_id property to hooks

## 0.64.0

### Minor Changes

- Add form components schemas

## 0.63.0

### Minor Changes

- Update forms schema

## 0.62.0

### Minor Changes

- Update the forms fileds

## 0.61.0

### Minor Changes

- Add forms

## 0.60.0

### Minor Changes

- Update the post users

## 0.59.0

### Minor Changes

- Separated the connections option schema

## 0.58.0

### Minor Changes

- Create sms users

## 0.57.0

### Minor Changes

- Add a otp grant flow for token

## 0.56.0

### Minor Changes

- Sms support

## 0.55.0

### Minor Changes

- Add a getByDomain function for cutsom domains and a tenant-id middleware

## 0.54.0

### Minor Changes

- Add domain verification info

## 0.53.0

### Minor Changes

- Make the cloudflare custom domains adapter use another adpater for storage

## 0.52.0

### Minor Changes

- Set the session id on login sessions

## 0.51.0

### Minor Changes

## 0.50.0

### Minor Changes

- Add an optional session refrence to login_sessions and cleanup old tables

## 0.49.0

### Minor Changes

## 0.48.0

### Minor Changes

- Get passwords can return nul

## 0.47.0

### Minor Changes

- Add custom domains table and adapter

## 0.46.0

### Minor Changes

- Handle expires at for sessions

## 0.45.0

### Minor Changes

- Update entities for sessions and refresh tokens

## 0.44.0

### Minor Changes

- Recreate the tables for sessions and refresh tokens

## 0.43.0

### Minor Changes

- make it possible to create a tenant with an id

## 0.42.0

### Minor Changes

- Update session entity

## 0.41.0

### Minor Changes

- 23c2899: Use default audience from tenant for refresh token

## 0.40.0

### Minor Changes

- Add refresh tokens to jwt

## 0.39.0

### Minor Changes

- Store refresh tokesn

## 0.38.0

### Minor Changes

- Add table for refresh tokens

## 0.37.0

### Minor Changes

- Optimized bundles

## 0.36.0

### Minor Changes

- use default listparams

## 0.35.0

### Minor Changes

- migrate connection auth
- a0a18c9: move most of authorize endpoint

## 0.34.0

### Minor Changes

- add password routes

## 0.33.0

### Minor Changes

- add sendgrid and postmark mail services
- migrate dbconnections and setup email providers

## 0.32.1

### Patch Changes

- update all build packages

## 0.32.0

### Minor Changes

- add hooks to add claims to token

## 0.31.0

### Minor Changes

- set used_at for codes

## 0.30.0

### Minor Changes

- fix incorrect imports

## 0.29.1

### Patch Changes

## 0.29.0

### Minor Changes

- add silent tokens

## 0.28.0

### Minor Changes

- switch back to native enum

## 0.27.0

### Minor Changes

- moved token types from the interfaces to the authhero package

## 0.26.0

### Minor Changes

- add ip to logins table

## 0.25.0

### Minor Changes

- added email providers and removed tickets
- Added email providers

## 0.24.0

### Minor Changes

- add code verifier to codes table

## 0.23.0

### Minor Changes

- make strategy mandatory for connections

## 0.22.1

### Patch Changes

- remove the iife build files

## 0.22.0

### Minor Changes

- Get the demo project rendering

## 0.21.0

### Minor Changes

- Added a act-as property to the auth params

## 0.20.3

### Patch Changes

- Expose the migration script for kysely and add authhero test

## 0.20.2

### Patch Changes

- Update packages

## 0.20.1

### Patch Changes

- Add prompt to login sessions

## 0.20.0

### Minor Changes

- Add ui_locales to authparams

## 0.19.0

### Minor Changes

- Add freja as connection type

## 0.18.0

### Minor Changes

- Expose app_metadata and user_metadata

## 0.17.1

### Patch Changes

- Add missing properties

## 0.17.0

### Minor Changes

- Change to use a json field for connection options

### Patch Changes

- Add more properties to connection options

## 0.16.0

### Minor Changes

- Remove old properties of connections

## 0.15.6

### Patch Changes

- Change the allowed_clients on the application to be string in kysely and array of strings in interfaces

## 0.15.5

### Patch Changes

- Changed so promptsetting uses a partial for the update

## 0.15.4

### Patch Changes

- Change order of default and optional

## 0.15.3

### Patch Changes

- Make properties with defaults optional

## 0.15.2

### Patch Changes

- Make application default to empty arrays and a nanoid for secret

## 0.15.1

### Patch Changes

- Make options optional

## 0.15.0

### Minor Changes

- Add prompt settings and update the connection entity
- Add prompt settings adapter

## 0.14.0

### Minor Changes

- Refine the jswks typs

## 0.13.0

### Minor Changes

- Remove certificate type
- Remove the certificate type and add new update method

## 0.12.0

### Minor Changes

- Updated the certificate entity

### Patch Changes

- Made certificate properties optional

## 0.11.9

### Patch Changes

- Remove the otp table

## 0.11.8

### Patch Changes

- Removed unused tables

## 0.11.7

### Patch Changes

- Add the user id to the codes entity

## 0.11.6

### Patch Changes

- Rebuilt the interfaces

## 0.11.5

### Patch Changes

- Added a connection_id property to the codes

## 0.11.4

### Patch Changes

- Add samlp specific validation for application

## 0.11.3

### Patch Changes

- Simplify client

## 0.11.2

### Patch Changes

- Refactor applications and clients

## 0.11.1

### Patch Changes

- Update the application types

## 0.11.0

### Minor Changes

- Add the addons property

### Patch Changes

- Update the applications schema to handle addOns

## 0.10.5

### Patch Changes

- Added pre-user-signup hook type

## 0.10.4

### Patch Changes

- Add more log types

## 0.10.3

### Patch Changes

- Handle boolean values

## 0.10.2

### Patch Changes

- Fix typo in property

## 0.10.1

### Patch Changes

- Add properties to hooks

## 0.10.0

### Minor Changes

- Updated the types for logins and fixed the packaging for authhero

## 0.9.2

### Patch Changes

- Fix plural on the logins adapter

## 0.9.1

### Patch Changes

- Centralized all codes to the codes table and added a new logins table for the login sessions. The old tables will be removed in the next update

## 0.9.0

### Minor Changes

- Added themes and changed primary key for sessions

## 0.8.0

### Minor Changes

- Moved bcrypt out of adapter

## 0.7.0

### Minor Changes

- Updated the builds and d.ts files

## 0.6.0

### Minor Changes

- Added a package for kysely

## 0.5.3

### Patch Changes

- Change the otp to be code or link

## 0.5.2

### Patch Changes

- 3625688: Build client adapters

## 0.5.1

### Patch Changes

- Add plural s to clients

## 0.5.0

### Minor Changes

- Add a temporary client adapter until we can pass the tenant_id

## 0.4.0

### Minor Changes

- Update the adapters
- Update the OTP entity to not include the client_id and tenant_id

## 0.3.1

### Patch Changes

- Created a new build for the adapters

## 0.3.0

### Minor Changes

- Updated the adapter for otps

## 0.2.2

### Patch Changes

- Missed doing a manula build

## 0.2.1

### Patch Changes

- Added missing exports, updated readme

## 0.2.0

### Minor Changes

- Update the Session and UniversalLoginSession adapter

## 0.1.3

### Patch Changes

- Add typescritpt types

## 0.1.2

### Patch Changes

- Update package json with correct path to artefacts

## 0.1.1

### Patch Changes

- Fixed the npm publishing so it's only including the dist folder

## 0.1.0

### Minor Changes

- Added package for apapter interfaces
