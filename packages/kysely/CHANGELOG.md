# @authhero/kysely-adapter

## 0.10.0

### Minor Changes

- Remove old properties of connections

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.16.0

## 0.9.7

### Patch Changes

- Change the allowed_clients on the application to be string in kysely and array of strings in interfaces
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.6

## 0.9.6

### Patch Changes

- Convert booleans to integers

## 0.9.5

### Patch Changes

- Changed so promptsetting uses a partial for the update
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.5

## 0.9.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.4

## 0.9.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.3

## 0.9.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.2

## 0.9.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.1

## 0.9.0

### Minor Changes

- Update kysely adapter for connection

### Patch Changes

- Add promptestting addapter
- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.0

## 0.8.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.14.0

## 0.8.0

### Minor Changes

- Remove the certificate type and add new update method

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.13.0

## 0.7.14

### Patch Changes

- Updated kysely for signing keys
- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.12.0

## 0.7.13

### Patch Changes

- Remove the otp table
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.9

## 0.7.12

### Patch Changes

- Removed unused tables
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.8

## 0.7.11

### Patch Changes

- Filter on tenant_id if avaialble
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.7

## 0.7.10

### Patch Changes

- Rebuild the kysely adapter
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.6

## 0.7.9

### Patch Changes

- Added a connection_id property to the codes
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.5

## 0.7.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.4

## 0.7.7

### Patch Changes

- Add husky to create builds on commit

## 0.7.6

### Patch Changes

- Fix typo in application get kysely adapter

## 0.7.5

### Patch Changes

- Simplify client
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.3

## 0.7.4

### Patch Changes

- Refactor applications and clients
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.2

## 0.7.3

### Patch Changes

- New build of kysely

## 0.7.2

### Patch Changes

- Handle empty allowed strings

## 0.7.1

### Patch Changes

- Update the application types
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.1

## 0.7.0

### Minor Changes

- Add the addons property

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.0

## 0.6.11

### Patch Changes

- Trim the logs description when writing a new entry
- Update the lucene filters to handle comparisons

## 0.6.10

### Patch Changes

- Fix the id column for logins

## 0.6.9

### Patch Changes

- 12d5d9f: Skip recursion for unflatten

## 0.6.8

### Patch Changes

- Fix the flatten helper and remove nulls from logins

## 0.6.7

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.5

## 0.6.6

### Patch Changes

- Build kysely adapter

## 0.6.5

### Patch Changes

- Add the redirect_uri to the authparmas for the authentication codes"

## 0.6.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.4

## 0.6.3

### Patch Changes

- Handle boolean values
- Updated dependencies
  - @authhero/adapter-interfaces@0.10.3

## 0.6.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.2

## 0.6.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.1

## 0.6.0

### Minor Changes

- Fixed issue with incorrect id in logins table

## 0.5.5

### Patch Changes

- Updated the types for logins and fixed the packaging for authhero
- Updated dependencies
  - @authhero/adapter-interfaces@0.10.0

## 0.5.4

### Patch Changes

- Fix plural on the logins adapter
- Updated dependencies
  - @authhero/adapter-interfaces@0.9.2

## 0.5.3

### Patch Changes

- Exported the login adapter.

## 0.5.2

### Patch Changes

- Centralized all codes to the codes table and added a new logins table for the login sessions. The old tables will be removed in the next update
- Updated dependencies
  - @authhero/adapter-interfaces@0.9.1

## 0.5.1

### Patch Changes

- Export themes adapter

## 0.5.0

### Minor Changes

- Added themes and changed primary key for sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.9.0

## 0.4.3

### Patch Changes

- Did a new build for the kysely adapter

## 0.4.2

### Patch Changes

- Fixed updates for applications

## 0.4.1

### Patch Changes

- Return null if a client isn't found

## 0.4.0

### Minor Changes

- Moved bcrypt out of adapter

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.8.0

## 0.3.0

### Minor Changes

- Updated the builds and d.ts files

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.7.0

## 0.2.0

### Minor Changes

- Added a package for kysely

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.6.0
