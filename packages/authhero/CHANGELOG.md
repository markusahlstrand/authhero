# authhero

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
