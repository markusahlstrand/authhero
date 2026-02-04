# authhero

## 4.28.0

### Minor Changes

- 88a03cd: Add ssr for widget
- ac8af37: Add custom text support

### Patch Changes

- Updated dependencies [88a03cd]
- Updated dependencies [ac8af37]
  - @authhero/widget@0.9.0
  - @authhero/adapter-interfaces@0.130.0

## 4.27.0

### Minor Changes

- a8e70e6: Fix fallbacks for sms service options
- a8e70e6: Update schemas to remove old fallbacks

### Patch Changes

- Updated dependencies [a8e70e6]
  - @authhero/adapter-interfaces@0.129.0

## 4.26.0

### Minor Changes

- f0fc1a0: Render themes and branding for widget

## 4.25.0

### Minor Changes

- e7f5ce5: Fix the universal-login-template in kysley

## 4.24.0

### Minor Changes

- 6585906: Move universal login templates to separate adapter

### Patch Changes

- Updated dependencies [6585906]
  - @authhero/adapter-interfaces@0.128.0

## 4.23.0

### Minor Changes

- fd374a9: Set theme id
- 8150432: Replaced legacy client

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0

## 4.22.0

### Minor Changes

- de7cb56: Filter out revoked sessions
- 154993d: Improve react-admin experience by clearing caches and setting cores

### Patch Changes

- Updated dependencies [154993d]
  - @authhero/adapter-interfaces@0.126.0

## 4.21.0

### Minor Changes

- 491842a: Bump packages to make sure the universal_login_templates is available

### Patch Changes

- Updated dependencies [491842a]
  - @authhero/adapter-interfaces@0.125.0

## 4.20.0

### Minor Changes

- 2af900c: Create a per user session cleanup
- 2be02f8: Add dynamic liquid templates
- 2af900c: Update guids to ulids

### Patch Changes

- Updated dependencies [2af900c]
- Updated dependencies [2be02f8]
  - @authhero/adapter-interfaces@0.124.0

## 4.19.0

### Minor Changes

- d979690: Update the widget embed functionality

## 4.18.0

### Minor Changes

- 147462f: Fix logouts for custom domains

## 4.17.0

### Minor Changes

- 9e7e36d: Handle multiple cookies
- c0792f6: Fix trailings slashes in redirect url

## 4.16.0

### Minor Changes

- f44bcd8: Temporary fix for move to partitioned cookies

## 4.15.0

### Minor Changes

- 2d0a7f4: Add a auth0-conformance flag

### Patch Changes

- Updated dependencies [2d0a7f4]
  - @authhero/adapter-interfaces@0.123.0

## 4.14.0

### Minor Changes

- 6f09503: Add favicon support to ui

## 4.13.0

### Minor Changes

- 8b9cb85: First passing openid test
- 16d21c8: Add paritioned cookies

## 4.12.0

### Minor Changes

- 5519225: Patch the scopes for client credentials
- 829afab: Hide sensistive info in management api
- 76510cd: Fixes for branding page and endpoint

## 4.11.0

### Minor Changes

- be0ac26: Fixed and issue with email users not being logged in after form hook

## 4.10.0

### Minor Changes

- a5f451a: Update the state logic for the continue endpoint
- 2cb9fc0: Fix the social links in the login-widget
- 2cb9fc0: Add a powered-by logo

## 4.9.1

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0

## 4.9.0

### Minor Changes

- e005714: Remove the complete login session

## 4.8.0

### Minor Changes

- 2853db0: Only show the selected connections for a client
- 8315e5c: Add the continue endpoint
- a98dbc4: Update scopes and permissions for client credentials
- 58ca131: Add cors for the screens endpoints

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
  - @authhero/adapter-interfaces@0.121.0

## 4.7.0

### Minor Changes

- 7277798: Improve logging for changing emails

## 4.6.0

### Minor Changes

- 00d2f83: Update versions to get latest build
- edcb62d: Fix a state bug in the login flow

### Patch Changes

- Updated dependencies [00d2f83]
  - @authhero/adapter-interfaces@0.120.0

## 4.5.0

### Minor Changes

- 5ecc8ad: Add impersonation in stencil component
- 26fe324: Fix the awaiting continuation

## 4.4.1

### Patch Changes

- Updated dependencies [8ab8c0b]
  - @authhero/adapter-interfaces@0.119.0

## 4.4.0

### Minor Changes

- 58634b0: Expose all hooks

## 4.3.0

### Minor Changes

- 1c69d08: Fix userinfo hook

## 4.2.0

### Minor Changes

- 742ef7c: Add tenant-id to token

## 4.1.0

### Minor Changes

- fb3b47e: Remove hard coded control-plane tenant id

## 4.0.0

### Major Changes

- 3d3fcc0: Move logic over to multi-tenancy

### Minor Changes

- 3d3fcc0: Migrate connections

## 3.6.0

### Minor Changes

- b7bb663: Make organizations lowercase

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0

## 3.5.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0

## 3.4.0

### Minor Changes

- 47fe928: Refactor create authhero
- f4b74e7: Add widget to react-admin
- b6d3411: Add a hono demo for the widget

## 3.3.0

### Minor Changes

- 71b01a6: Move authhero to peer dependency

## 3.2.0

### Minor Changes

- 9c15354: Remove shadcn and updated widget

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0

## 3.1.0

### Minor Changes

- 63e4ecb: Use assets folder
- 8858622: Move fallbacks to multi-tenancy package

## 3.0.0

### Patch Changes

- Updated dependencies [8e9a085]
  - @authhero/widget@0.4.0

## 2.0.0

### Patch Changes

- Updated dependencies [23c06fc]
  - @authhero/widget@0.3.0

## 1.4.0

### Minor Changes

- 928d358: Add userinfo hook

## 1.3.0

### Minor Changes

- f738edf: Add checkpoint pagination for organizations

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0
  - @authhero/widget@0.2.2

## 1.2.0

### Minor Changes

- c8c83e3: Add a admin:organizations permission to hande organizations in the control_plane

## 1.1.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries
- e542773: Fixes for syncing resources servers and global roles

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0
  - @authhero/widget@0.2.1

## 1.0.0

### Minor Changes

- d967833: Add a stencil-js widget for login

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0
  - @authhero/widget@0.2.0

## 0.309.0

### Minor Changes

- aaf0aa0: Fix paging issue for scopes
- aaf0aa0: Update permissions casing

## 0.308.0

### Minor Changes

- bbe5492: Add real scopes

## 0.307.0

### Minor Changes

- 63f9c89: Remove requirement for password users to have verified emails

## 0.306.0

### Minor Changes

- 0f8e4e8: Change from main to control plane
- 3a180df: Fix organization names for main tenant

## 0.305.0

### Minor Changes

- aba8ef9: Handle org tokens for the main tenant

## 0.304.0

### Minor Changes

- 1c36752: Use org tokens for tenants in admin

## 0.303.0

### Minor Changes

- b778aed: Seed mananagement roles and create organizations

## 0.302.0

### Minor Changes

- 283daf2: Refactor multi-tenancy package
- ae8553a: Add is_system to all adapters

### Patch Changes

- Updated dependencies [ae8553a]
  - @authhero/adapter-interfaces@0.112.0

## 0.301.0

### Minor Changes

- e87ab70: Move tenants crud to multi-tenancy package

## 0.300.0

### Minor Changes

- 100b1bd: Patch the redirect action for flows

## 0.299.0

### Minor Changes

- 9e34783: Sync resource servers for multi tenancy setup

## 0.298.0

### Minor Changes

- 02567cd: Make create authhero work with d1 locally
- 906337d: Add flows support
- f3f96df: Add support for entity hooks

### Patch Changes

- Updated dependencies [906337d]
  - @authhero/adapter-interfaces@0.111.0

## 0.297.0

### Minor Changes

- a108525: Add flows

### Patch Changes

- Updated dependencies [a108525]
  - @authhero/adapter-interfaces@0.110.0

## 0.296.0

### Minor Changes

- 49d5eb8: Handle email change of linked accounts
- 49d5eb8: Handle disable signups in social flows
- 1bec131: Add stats endpoints and activity view

### Patch Changes

- Updated dependencies [1bec131]
  - @authhero/adapter-interfaces@0.109.0

## 0.295.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 0.294.0

### Minor Changes

- 6929f98: Improve the create authhero for local

## 0.293.0

### Minor Changes

- 85b58c4: Update the scripts and the logic in the identifier page

## 0.292.0

### Minor Changes

- 973a72e: Clear invalid session cookies

## 0.291.2

### Patch Changes

- Updated dependencies [0e906aa]
  - @authhero/adapter-interfaces@0.108.0

## 0.291.1

### Patch Changes

- Updated dependencies [212f5c6]
  - @authhero/adapter-interfaces@0.107.0

## 0.291.0

### Minor Changes

- 5ed04e5: Add forms router support

## 0.290.1

### Patch Changes

- Updated dependencies [f37644f]
  - @authhero/adapter-interfaces@0.106.0

## 0.290.0

### Minor Changes

- 40caf1a: Add support for different connections for different clients. And support sorting.

### Patch Changes

- Updated dependencies [40caf1a]
  - @authhero/adapter-interfaces@0.105.0

## 0.289.0

### Minor Changes

- 125dbb9: Flow updates

### Patch Changes

- Updated dependencies [125dbb9]
  - @authhero/adapter-interfaces@0.104.0

## 0.288.0

### Minor Changes

- c51ab9b: Fetch settings from connection

## 0.287.0

### Minor Changes

- b0c4421: Add oidc and icon_url
- c96d83b: Added dispaly name on connections

### Patch Changes

- Updated dependencies [b0c4421]
- Updated dependencies [c96d83b]
  - @authhero/adapter-interfaces@0.103.0

## 0.286.0

### Minor Changes

- 65db836: Update logging to kysely

## 0.285.0

### Minor Changes

- e04bae4: Update the logging handle geoip correctly

## 0.284.0

### Minor Changes

- 6952865: Handle undefined adapters

## 0.283.0

### Minor Changes

- 0566155: Get provider from connection

### Patch Changes

- Updated dependencies [0566155]
- Updated dependencies [0566155]
  - @authhero/adapter-interfaces@0.102.0

## 0.282.0

### Minor Changes

- 8ab05b4: Add multi-tenancy package

## 0.281.0

### Minor Changes

- 165addf: Update how scopes work for refresh tokens

## 0.280.0

### Minor Changes

- 8c373f0: Change to return 400 for refresh token error code

## 0.279.0

### Minor Changes

- 84f7b60: Change id of passwords to use nanoid

## 0.278.0

### Minor Changes

- 9d92786: Fix password reset

## 0.277.0

### Minor Changes

- 584871c: Add more logging for refresh token flow

## 0.276.0

### Minor Changes

- 0ffb5ca: Add support for password strength

### Patch Changes

- Updated dependencies [0ffb5ca]
  - @authhero/adapter-interfaces@0.101.0

## 0.275.0

### Minor Changes

- d381383: Moved failed invalid passwords up in the flow

## 0.274.0

### Minor Changes

- 3a0d8ee: Add geo info

### Patch Changes

- Updated dependencies [3a0d8ee]
  - @authhero/adapter-interfaces@0.100.0

## 0.273.0

### Minor Changes

- 79680de: Enforce audience with fallback to tenant default and embedded browser detection.
- 79680de: Enforce audience
- 29192de: Add warning for embedded browsers

## 0.272.0

### Minor Changes

- 745a032: Fix show password

## 0.271.0

### Minor Changes

- a0dd349: Fix permissions for client credentials flow

## 0.270.0

### Minor Changes

- 7f8ac8e: Add a incognito warning message

## 0.269.0

### Minor Changes

- fa14193: Store failed passwords in the app_metadata

## 0.268.0

### Minor Changes

- 9c24bcb: Set permissions for client credentials when rbac is enabled

## 0.267.0

### Minor Changes

- 251c143: Add logs for reset password

## 0.266.0

### Minor Changes

- edc006c: Fix the impersonate flow with password

## 0.265.1

### Patch Changes

- Updated dependencies [a3c69f0]
  - @authhero/adapter-interfaces@0.99.0

## 0.265.0

### Minor Changes

- a96d5ef: Handle client secret for refresh tokens

## 0.264.0

### Minor Changes

- 6067f00: Update the hook names

### Patch Changes

- Updated dependencies [6067f00]
  - @authhero/adapter-interfaces@0.98.0

## 0.263.0

### Minor Changes

- 3ae077b: ValidateSignupEmail hook

## 0.262.0

### Minor Changes

- Check for password identity on login

## 0.261.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.97.0

## 0.261.0

### Minor Changes

- Fix account linking for created password accounts

## 0.260.0

### Minor Changes

- Use authorization type form authorize request when impersonating

## 0.259.0

### Minor Changes

- Change errors to return json

## 0.258.0

### Minor Changes

- Move pre signup hook

## 0.257.0

### Minor Changes

- Add tenant id to var if there is a bearer token

## 0.256.0

### Minor Changes

- Added invites

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.96.0

## 0.255.1

### Patch Changes

- Updated dependencies
  - @authhero/saml@0.3.0

## 0.255.0

### Minor Changes

- Add act claim to token

## 0.254.0

### Minor Changes

- pnpm chnageset version

## 0.253.0

### Minor Changes

- Fix the password when creating a new user

## 0.252.0

### Minor Changes

- e52a74e: Move saml to separate package

### Patch Changes

- Updated dependencies [e52a74e]
  - @authhero/saml@0.2.0

## 0.251.0

### Minor Changes

- Pass language to email

## 0.250.0

### Minor Changes

- Update the logo and language for sending emails

## 0.249.0

### Minor Changes

- Add failed token exchange logs

## 0.248.0

### Minor Changes

- Merge settings and tenants table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.95.0

## 0.247.0

### Minor Changes

- Add settings endpoint
- Refactor strategies

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.94.0

## 0.246.0

### Minor Changes

- Fix the code form

## 0.245.0

### Minor Changes

- Fix id-token org format

## 0.244.0

### Minor Changes

- Add remaining forms

## 0.243.0

### Minor Changes

- b5dc556: pnpm changset version
- Add remaining shadcn forms

## 0.242.0

### Minor Changes

- Add more shadcn forms

## 0.241.0

### Minor Changes

- Add new events and update chadcn layout

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.93.0

## 0.240.0

### Minor Changes

- Add microsoft and github login

## 0.239.0

### Minor Changes

- Add chadcn for ui

## 0.238.0

### Minor Changes

- Add storybook

## 0.237.0

### Minor Changes

- 85f639b: Add audience and scope to logs

## 0.236.0

### Minor Changes

- Update the link user logic

## 0.235.0

### Minor Changes

- Improve logging
- Update the logic for account linking

## 0.234.0

### Minor Changes

- Add a act claim to the tokens when impersonating

## 0.233.0

### Minor Changes

- Remove disable signup from legacy client

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.92.0

## 0.232.0

### Minor Changes

- Extend hooks api

## 0.231.0

### Minor Changes

- Update redirect_uri validation logic

## 0.230.0

### Minor Changes

- Add support for subdomain wildcards

## 0.229.0

### Minor Changes

- Add json support for token endpoint

## 0.228.0

### Minor Changes

- Create a new login session for silent auth

## 0.227.0

### Minor Changes

- Update tenant-id header handling

## 0.226.0

### Minor Changes

- Allow change or organization with silent auth

## 0.225.0

### Minor Changes

- Organization support in token endpoint

## 0.224.0

### Minor Changes

- Fix routes for org members
- Change status code for adding member to organization

## 0.223.0

### Minor Changes

- Organization members

## 0.222.0

### Minor Changes

- Fix options for resource servers

## 0.221.0

### Minor Changes

- e917a6a: Fix content-type for reuse of code
- Update ids to match auth0 entity ids

## 0.220.0

### Minor Changes

- Add org name to id-token

## 0.219.0

### Minor Changes

- Return all scopes as default for client credentials

## 0.218.0

### Minor Changes

- # 6858af2: Add client credentials scopes and permissions
- 149ab91: Drop the old application table
  > > > > > > > main
- b0e9595: Add client grants

### Patch Changes

- Updated dependencies [149ab91]
- Updated dependencies [b0e9595]
  - @authhero/adapter-interfaces@0.91.0

## 0.217.0

### Minor Changes

- Added language string

## 0.216.0

### Minor Changes

- Fix issues with lucene filter

## 0.215.0

### Minor Changes

- Add legacy clients to caching

## 0.214.0

### Minor Changes

- Add scopes and permissions

## 0.213.0

### Minor Changes

- Switch from appications to clients entity in managment api

## 0.212.0

### Minor Changes

- Update to use new clients

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.90.0

## 0.211.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.89.0

## 0.211.0

### Minor Changes

- Changed to LegacyClient as a first step in the refactor
- 11c4914: Refactor account pages

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.88.0

## 0.210.0

### Minor Changes

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

## 0.180.0

### Minor Changes

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

## 0.129.0

### Minor Changes

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
