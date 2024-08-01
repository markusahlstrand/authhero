# @authhero/kysely-adapter

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
