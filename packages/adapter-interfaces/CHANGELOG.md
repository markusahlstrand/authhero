# @authhero/adapter-interfaces

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
