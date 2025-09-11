# authhero

## 0.210.0

### Minor Changes

- 086bb04: pnpm changeset version

## 0.209.0

### Minor Changes

- d5ebc83: Update endpoints and UI for organziation memebers
- Get organizations crud working like auth0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.87.0

## 0.208.0

### Minor Changes

- Add users to organizations

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.86.0

## 0.207.0

### Minor Changes

- Added organizations

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.85.0

## 0.206.0

### Minor Changes

- Update the UI for change email

## 0.205.0

### Minor Changes

- Add post user login hook

## 0.204.0

### Minor Changes

- Fix x-forwarded-for

## 0.203.0

### Minor Changes

- Handle screen_hint and redirect_uri for accoutn

## 0.202.0

### Minor Changes

- Add impersonation page

## 0.201.0

### Minor Changes

- Reuse existing sessions

## 0.200.0

### Minor Changes

- 3635f08: pnpm changeset version
- Add account path
- Add route for account

## 0.199.0

### Minor Changes

- Add a user_id param to the account page

## 0.198.0

### Minor Changes

- Fix the caching

## 0.197.0

### Minor Changes

- Add cache adapter

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.84.0

## 0.196.0

### Minor Changes

- Use separate saml key for encryption

## 0.195.0

### Minor Changes

- Add type to keys

### Patch Changes

- e1c0b34: pnpm changeset version
- Updated dependencies
  - @authhero/adapter-interfaces@0.83.0

## 0.194.0

### Minor Changes

- Add user roles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.82.0

## 0.193.0

### Minor Changes

- fc8153d: Update structure and endpoints

### Patch Changes

- Updated dependencies [fc8153d]
  - @authhero/adapter-interfaces@0.81.0

## 0.192.0

### Minor Changes

- Add api endpoints for permissions

## 0.191.0

### Minor Changes

- Fetch jwks from database

## 0.190.0

### Minor Changes

- Return multiple saml certificates

## 0.189.0

### Minor Changes

- Add roles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.80.0

## 0.188.0

### Minor Changes

- Update the casing for the migratinos

## 0.187.0

### Minor Changes

- Add resource servers, rules and permissions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.79.0

## 0.186.0

### Minor Changes

- Remove vendorsettings

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.78.0

## 0.185.0

### Minor Changes

- Add a lighten color util

## 0.184.0

### Minor Changes

- Add client_metadata to client type

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.77.0

## 0.183.0

### Minor Changes

- Use theme instead of vendorSetting

## 0.182.0

### Minor Changes

- Add a main tenant adapter

## 0.181.0

### Minor Changes

- Update the themes entity

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.76.0

## 0.180.1

### Patch Changes

- a016d97: pnpm changeset version

## 0.180.0

### Minor Changes

- 8a9be02: pnpm changeset version

## 0.179.0

### Minor Changes

- Use hono jwt in middleware

## 0.178.0

### Minor Changes

- Fix issue with encoding the redirect-url

## 0.177.0

### Minor Changes

- Handle base path in auth middleware

## 0.176.0

### Minor Changes

- Add themes endpoints

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.75.0

## 0.175.0

### Minor Changes

- Refactor log types

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.74.0

## 0.174.0

### Minor Changes

- Add hook for pre user update

## 0.173.0

### Minor Changes

- Complete first version of change email flow

## 0.172.0

### Minor Changes

- Add a page to change the current users email

## 0.171.0

### Minor Changes

- Use countrycode from vendor settings if available

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.73.0

## 0.170.0

### Minor Changes

- Create refresh tokens for code grant flow

## 0.169.0

### Minor Changes

- Fix creation of password user in combination with linking of users

## 0.168.0

### Minor Changes

- Use corret response type for web message

## 0.167.0

### Minor Changes

- Add the state to the web message

## 0.166.0

### Minor Changes

- Refactor token endpoint

## 0.165.0

### Minor Changes

- c5fb2fa: Refactor grant flows

## 0.164.0

### Minor Changes

- Refactor auth0client

## 0.163.0

### Minor Changes

- Remove fragments from redirect_uri

## 0.162.0

### Minor Changes

- Redirect back to callback url with error

## 0.161.0

### Minor Changes

- Use profile to store preferred login method

## 0.160.0

### Minor Changes

- Add saml support

## 0.159.0

### Minor Changes

- Only enforce ip check on magic link flow
- Updated packages and added danish

## 0.158.0

### Minor Changes

- Redirect straight to single OIDC connection

## 0.157.0

### Minor Changes

- Use normaized user to handle sms login

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.72.0

## 0.156.0

### Minor Changes

- Fetch expired login sessions

## 0.155.0

### Minor Changes

- Store the redirect_uri in codes table on silent auth

## 0.154.0

### Minor Changes

- pnpm changeset version
- Add config to connection to enable magic links

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.71.0

## 0.153.0

### Minor Changes

- Added state and nonce to codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.70.0

## 0.152.0

### Minor Changes

- Add redirect_uri to codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.69.0

## 0.151.0

### Minor Changes

- Add code_challenge to codes table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.68.0

## 0.150.0

### Minor Changes

- Use codes-code_verifier to store pkce challenge

## 0.149.0

### Minor Changes

- pnpm changeset version

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.67.0

## 0.148.0

### Minor Changes

- Pass the context to the events

## 0.147.0

### Minor Changes

- Expose the onPostLogin type

## 0.146.0

### Minor Changes

- Add a html response for expired code links

## 0.145.0

### Minor Changes

- Complete the login after the form is posted

## 0.144.0

### Minor Changes

- Fix an issue where we passed the session is rather than the login session id

## 0.143.0

### Minor Changes

- Add a login_completed flag to the login sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.66.0

## 0.142.0

### Minor Changes

- Add a form_id property to hooks

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.65.0

## 0.141.0

### Minor Changes

- Update logic for when refresh tokens are created

## 0.140.0

### Minor Changes

- Add form components schemas

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.64.0

## 0.139.0

### Minor Changes

- Update forms schema

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.63.0

## 0.138.0

### Minor Changes

- Update the forms fileds

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.62.0

## 0.137.0

### Minor Changes

- Update the path for the mangement api

## 0.136.0

### Minor Changes

- Add rest endpoints for forms

## 0.135.0

### Minor Changes

- Add forms

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.61.0

## 0.134.0

### Minor Changes

- Enable query string filters for sessions

## 0.133.0

### Minor Changes

- fix issue with getClientInfo returning country code

## 0.132.0

### Minor Changes

- Update the post users

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.60.0

## 0.131.0

### Minor Changes

- Update the copy on the identifier page

## 0.130.0

### Minor Changes

- 370eb2f: pnpm changeset version

## 0.129.0

### Minor Changes

- d64c18d: pnpm changeset version

## 0.128.0

### Minor Changes

- Sms from property

## 0.127.0

### Minor Changes

- Fix issue with country code column missing

## 0.126.0

### Minor Changes

- Facebook app update

## 0.125.0

### Minor Changes

- Format phonenumbers

## 0.124.0

### Minor Changes

- Fix duplicate sessions

## 0.123.0

### Minor Changes

- Add caching to adapters

## 0.122.0

### Minor Changes

- Add caching for adapters

## 0.121.0

### Minor Changes

- Add server timings

## 0.120.0

### Minor Changes

- 6f2dca6: pnpm changeset version

## 0.119.0

### Minor Changes

- Redirect callback to custom domain

## 0.118.0

### Minor Changes

- Use custom domain for auth cookies

## 0.117.0

### Minor Changes

- Separated the connections option schema

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.59.0

## 0.116.0

### Minor Changes

- Add support for sms in universal login

## 0.115.0

### Minor Changes

- Use idle expires at for refresh tokens
- 51c5158: pnpm changeset version

## 0.114.0

### Minor Changes

- Change enter-email page to identifier

## 0.113.0

### Minor Changes

- Create sms users

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.58.0

## 0.112.0

### Minor Changes

- Fix broken magic link

## 0.111.0

### Minor Changes

- Add screen_hint for signup

## 0.110.0

### Minor Changes

- Add a otp grant flow for token

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.57.0

## 0.109.0

### Minor Changes

- Add build scripts for tailwind

## 0.108.0

### Minor Changes

- Sms support

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.56.0

## 0.107.0

### Minor Changes

- Update iss in id-token as well

## 0.106.0

### Minor Changes

- Add trailing slash to custom domain iss

## 0.105.0

### Minor Changes

- Change iss to custom domain

## 0.104.0

### Minor Changes

- Add cors for token endpoint

## 0.103.0

### Minor Changes

- Add cors middleware for api endpoints"

## 0.102.0

### Minor Changes

- Allow signup if explicit

## 0.101.0

### Minor Changes

- fetch vendor by subdomain

## 0.100.0

### Minor Changes

- Add a getByDomain function for cutsom domains and a tenant-id middleware

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.55.0

## 0.99.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.54.0

## 0.99.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.53.0

## 0.99.0

### Minor Changes

- fbc3a6c: Make the logout revoke the session and remove refresh tokens
- fbc3a6c: Make logout remove any sessions

## 0.98.0

### Minor Changes

- Update the session id on the login session

### Patch Changes

- Do not allow reuse of login sessions

## 0.97.0

### Minor Changes

- Set the session id on login sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.52.0

## 0.96.0

### Minor Changes

- Fix issues around signup flow

## 0.95.0

### Minor Changes

- Fix pre-signup-sent routes

## 0.94.0

### Minor Changes

- Fix incorrect paths for migrated pages

## 0.93.0

### Minor Changes

- Migrate last pages

## 0.92.0

### Minor Changes

- Migrate pre signup page and email

## 0.91.0

### Minor Changes

- Fix issue with missing login session id

## 0.90.0

### Minor Changes

- pnpm changeset version

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.51.0

## 0.89.0

### Minor Changes

- Add an optional session refrence to login_sessions and cleanup old tables

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.50.0

## 0.88.0

### Minor Changes

- Use wildcad domains for session cookies

## 0.87.0

### Minor Changes

- Handle code response type in silent auth flow

## 0.86.0

### Minor Changes

- Hande idle_expires_at in silent auth

## 0.85.0

### Minor Changes

- Create a new password if it doesn't exist

## 0.84.0

### Minor Changes

- a9959ad: pnpm changeset version

### Patch Changes

- Updated dependencies [a9959ad]
  - @authhero/adapter-interfaces@0.49.0

## 0.83.0

### Minor Changes

- Add the request object to the hooks event

## 0.82.0

### Minor Changes

- 52896d7: Add pre user registration hook
- 52896d7: Add the post user registration hook

## 0.81.0

### Minor Changes

- Add a cloudflare adapter

## 0.80.0

### Minor Changes

- Use correct email template

## 0.79.0

### Minor Changes

- Only validate IP for magic links

## 0.78.0

### Minor Changes

- Get passwords can return nul

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.48.0

## 0.77.0

### Minor Changes

- Ensure hooks are invoked

## 0.76.0

### Minor Changes

- Fix issue with redirect url encoding

## 0.75.0

### Minor Changes

- Add custom domain routes

## 0.74.2

### Patch Changes

- Create the user if there's a matching email

## 0.74.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.47.0

## 0.74.0

### Minor Changes

- 8c316c4: pnpm changeset version

## 0.73.0

### Minor Changes

- Add post user login webhook back

## 0.72.0

### Minor Changes

- Pass login session in check account

## 0.71.0

### Minor Changes

- Fix path for post check-account

## 0.70.0

### Minor Changes

- Create new users with passwordless

## 0.69.0

### Minor Changes

- Add connection to magic link

## 0.68.0

### Minor Changes

- Fix magic links

## 0.67.0

### Minor Changes

- Migrate reset password

## 0.66.0

### Minor Changes

- Migrate signup route

## 0.65.0

### Minor Changes

- Migarate reset password

## 0.64.0

### Minor Changes

- Migrate enter password

## 0.63.0

### Minor Changes

- Migrate code flow

## 0.62.0

### Minor Changes

- Add the enter email form

## 0.61.0

### Minor Changes

- Handle expires at for sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.46.0

## 0.60.0

### Minor Changes

- Enforce idle expire at

## 0.59.0

### Minor Changes

- Create temporary tables

## 0.58.0

### Minor Changes

- Add refresh_tokens route

## 0.57.0

### Minor Changes

- Update entities for sessions and refresh tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.45.0

## 0.56.0

### Minor Changes

- Recreate the tables for sessions and refresh tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.44.0

## 0.55.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.43.0

## 0.55.0

### Minor Changes

- Update session entity

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.42.0

## 0.54.0

### Minor Changes

- Update open-configuration

## 0.53.0

### Minor Changes

- Add refresh token grant support

## 0.52.0

### Minor Changes

- 23c2899: Use default audience from tenant for refresh token

### Patch Changes

- Updated dependencies [23c2899]
  - @authhero/adapter-interfaces@0.41.0

## 0.51.0

### Minor Changes

- Add refresh tokens to jwt

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.40.0

## 0.50.0

### Minor Changes

- Store refresh tokesn

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.39.0

## 0.49.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.38.0

## 0.49.0

### Minor Changes

- Update logs for logins

## 0.48.0

### Minor Changes

- Allow wildcards on the path

## 0.47.0

### Minor Changes

- create variables to separate issuer from domains

## 0.46.0

### Minor Changes

- fix padding for pkce

## 0.45.0

### Minor Changes

- Fetch facebook userinfo from me endpoint

## 0.44.0

### Minor Changes

- pass the access token for the vipps connection

## 0.43.0

### Minor Changes

- Fix for universal auth emails

## 0.42.0

### Minor Changes

- Use default client for magic link

## 0.41.0

### Minor Changes

- Add saml support

## 0.40.0

### Minor Changes

- Optimized bundles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.37.0

## 0.39.0

### Minor Changes

- 16dc682: fix vipps integration

## 0.38.0

### Minor Changes

- fix issue with user_id in code grant flow

## 0.37.0

### Minor Changes

- migrate the enter-email page

## 0.36.2

### Patch Changes

- Remove list params where not needed

## 0.36.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.36.0

## 0.36.0

### Minor Changes

- fix json format for connection options

## 0.35.0

### Minor Changes

- migrate callback route

## 0.34.0

### Minor Changes

- migrate the callback routes

## 0.33.0

### Minor Changes

- Use default clients for connections

## 0.32.1

### Patch Changes

- check default client for callback

## 0.32.0

### Minor Changes

- migrate connection auth
- a0a18c9: move most of authorize endpoint

### Patch Changes

- Updated dependencies
- Updated dependencies [a0a18c9]
  - @authhero/adapter-interfaces@0.35.0

## 0.31.0

### Minor Changes

- add password routes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.34.0

## 0.30.0

### Minor Changes

- 3347f29: add passwordless routes

## 0.29.0

### Minor Changes

- add language files

## 0.28.0

### Minor Changes

- pass email provider to email service

## 0.27.0

### Minor Changes

- update packages

## 0.26.0

### Minor Changes

- add id-token support to hook
- migrate dbconnections and setup email providers

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.33.0

## 0.25.2

### Patch Changes

- update all build packages
- Updated dependencies
  - @authhero/adapter-interfaces@0.32.1

## 0.25.1

### Patch Changes

- update the build

## 0.25.0

### Minor Changes

- update hook signature

## 0.24.0

### Minor Changes

- add hooks to add claims to token

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.32.0

## 0.23.0

### Minor Changes

- set used_at for codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.31.0

## 0.22.0

### Minor Changes

- fix incorrect imports

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.30.0

## 0.21.0

### Minor Changes

- fix redirect validation logic
- c16a591: add userinfo and logout endpoints

## 0.20.2

### Patch Changes

- Updated dependencies [fbc0e55]
  - @authhero/adapter-interfaces@0.29.1

## 0.20.1

### Patch Changes

- fix refernce to safe compare

## 0.20.0

### Minor Changes

- add a default client as a temporary solutoin

## 0.19.0

### Minor Changes

- add a fallback client as a temporary solution

## 0.18.0

### Minor Changes

- moved the init of the hooks

## 0.17.0

### Minor Changes

- add silent tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.29.0

## 0.16.0

### Minor Changes

- switch back to native enum

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.28.0

## 0.15.0

### Minor Changes

- 05c7273: Add authorization code grant support
- 14794b6: support id-tokens
- moved token types from the interfaces to the authhero package
- 76b4c53: add client credentials support

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.27.0

## 0.14.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.26.0

## 0.14.0

### Minor Changes

- added email providers and removed tickets
- Added email providers

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.25.0

## 0.13.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.24.0

## 0.13.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.23.0

## 0.13.0

### Minor Changes

- remove path prefix for management routes

## 0.12.0

### Minor Changes

- do not pass interfaces as peer dependency

## 0.11.0

### Minor Changes

- pass the interfaces as a peer dependency

## 0.10.1

### Patch Changes

- remove the iife build files
- Updated dependencies
  - @authhero/adapter-interfaces@0.22.1

## 0.10.0

### Minor Changes

- Get the demo project rendering

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.22.0

## 0.9.0

### Minor Changes

- Added a act-as property to the auth params

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.21.0

## 0.8.0

### Minor Changes

- Add the keys endpoints

## 0.7.0

### Minor Changes

- Add auth middleware for management routes

## 0.6.0

### Minor Changes

- Add support for include_totals in hooks

## 0.5.0

### Minor Changes

- Store hook booleans as integers
- bb18986: Add prompts endpoint

## 0.4.0

### Minor Changes

- 0bbc1a4: Migrate logs and user routes
- 26e2ef9: Fixed the connection tests and handle include_totals correctly
- Add the users by email endpoint

### Patch Changes

- 35338fc: Add tests for users

## 0.3.0

### Minor Changes

- 4064c4d: Add clients endpoints
- a4b587d: Added the connection routes

### Patch Changes

- 8244aa2: Pass the issuer in the config rather than in env
- 8244aa2: Add test server with migrations
- 8244aa2: Added tests for tenants endpoint

## 0.2.38

### Patch Changes

- Expose the migration script for kysely and add authhero test
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.3

## 0.2.37

### Patch Changes

- Update packages
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.2

## 0.2.36

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.1

## 0.2.35

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.0

## 0.2.34

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.19.0

## 0.2.33

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.18.0

## 0.2.32

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.17.1

## 0.2.31

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.17.0

## 0.2.30

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.16.0

## 0.2.29

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.6

## 0.2.28

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.5

## 0.2.27

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.4

## 0.2.26

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.3

## 0.2.25

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.2

## 0.2.24

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.1

## 0.2.23

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.0

## 0.2.22

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.14.0

## 0.2.21

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.13.0

## 0.2.20

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.12.0

## 0.2.19

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.9

## 0.2.18

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.8

## 0.2.17

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.7

## 0.2.16

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.6

## 0.2.15

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.5

## 0.2.14

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.4

## 0.2.13

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.3

## 0.2.12

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.2

## 0.2.11

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.1

## 0.2.10

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.0

## 0.2.9

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.5

## 0.2.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.4

## 0.2.7

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.3

## 0.2.6

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.2

## 0.2.5

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.1

## 0.2.4

### Patch Changes

- Updated the types for logins and fixed the packaging for authhero
- Updated dependencies
  - @authhero/adapter-interfaces@0.10.0

## 0.2.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.9.2

## 0.2.2

### Patch Changes

- Centralized all codes to the codes table and added a new logins table for the login sessions. The old tables will be removed in the next update
- Updated dependencies
  - @authhero/adapter-interfaces@0.9.1

## 0.2.1

### Patch Changes

- Updated the package to reference to correct folder

## 0.2.0

### Minor Changes

- Update the package to support both esm and cjs

## 0.1.0

### Minor Changes

- a1212dc: Added a jwks route with mock data
