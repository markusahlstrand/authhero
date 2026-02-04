# @authhero/multi-tenancy

## 14.9.0

### Minor Changes

- d1df006: Add fallback to control plane client

## 14.8.0

### Minor Changes

- a8e70e6: Fix fallbacks for sms service options
- a8e70e6: Update schemas to remove old fallbacks

### Patch Changes

- Updated dependencies [a8e70e6]
- Updated dependencies [a8e70e6]
  - authhero@4.27.0
  - @authhero/adapter-interfaces@0.129.0

## 14.7.0

### Minor Changes

- 8150432: Replaced legacy client

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0
  - authhero@4.23.0

## 14.6.0

### Minor Changes

- 829afab: Hide sensistive info in management api

### Patch Changes

- Updated dependencies [5519225]
- Updated dependencies [829afab]
- Updated dependencies [76510cd]
  - authhero@4.12.0

## 14.5.0

### Minor Changes

- 9d6cfb8: Wrap adapters as part of the multi-tenant package

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0
  - authhero@4.9.1

## 14.4.0

### Minor Changes

- 967d470: Add a metadata field to roles and resource-servers

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
- Updated dependencies [8315e5c]
- Updated dependencies [a98dbc4]
- Updated dependencies [58ca131]
  - @authhero/adapter-interfaces@0.121.0
  - authhero@4.8.0

## 14.3.0

### Minor Changes

- d7e8c95: Update dependencies

## 14.2.0

### Minor Changes

- fb3b47e: Remove hard coded control-plane tenant id

### Patch Changes

- Updated dependencies [fb3b47e]
  - authhero@4.1.0

## 14.1.0

### Minor Changes

- 489db0b: Remove the connection sync
  Created a saas multi-tenant guide

## 14.0.0

### Major Changes

- 3d3fcc0: Move logic over to multi-tenancy

### Minor Changes

- 3d3fcc0: Migrate connections

### Patch Changes

- Updated dependencies [3d3fcc0]
- Updated dependencies [3d3fcc0]
  - authhero@4.0.0

## 13.20.0

### Minor Changes

- b7bb663: Make organizations lowercase

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0
  - authhero@3.6.0

## 13.19.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0
  - authhero@3.5.0

## 13.18.0

### Minor Changes

- 6dcb42e: Refactor assets

## 13.17.0

### Minor Changes

- 71b01a6: Move authhero to peer dependency

### Patch Changes

- Updated dependencies [71b01a6]
  - authhero@3.3.0

## 13.16.0

### Minor Changes

- 9c15354: Remove shadcn and updated widget

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0
  - authhero@3.2.0

## 13.15.0

### Minor Changes

- 8858622: Move fallbacks to multi-tenancy package

### Patch Changes

- Updated dependencies [63e4ecb]
- Updated dependencies [8858622]
  - authhero@3.1.0

## 13.14.0

### Minor Changes

- 44b751a: Sync connections

## 13.13.3

### Patch Changes

- authhero@3.0.0

## 13.13.2

### Patch Changes

- authhero@2.0.0

## 13.13.1

### Patch Changes

- Updated dependencies [928d358]
  - authhero@1.4.0

## 13.13.0

### Minor Changes

- efaad87: Check for permissions rather than scopes for tenants

## 13.12.1

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0
  - authhero@1.3.0

## 13.12.0

### Minor Changes

- c8c83e3: Add a admin:organizations permission to hande organizations in the control_plane

### Patch Changes

- Updated dependencies [c8c83e3]
  - authhero@1.2.0

## 13.11.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries
- e542773: Fixes for syncing resources servers and global roles

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0
  - authhero@1.1.0

## 13.10.1

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0
  - authhero@1.0.0

## 13.10.0

### Minor Changes

- aaf0aa0: Fix paging issue for scopes
- aaf0aa0: Update permissions casing

### Patch Changes

- Updated dependencies [aaf0aa0]
- Updated dependencies [aaf0aa0]
  - authhero@0.309.0

## 13.9.0

### Minor Changes

- bbe5492: Add real scopes

### Patch Changes

- Updated dependencies [bbe5492]
  - authhero@0.308.0

## 13.8.1

### Patch Changes

- Updated dependencies [63f9c89]
  - authhero@0.307.0

## 13.8.0

### Minor Changes

- 0f8e4e8: Change from main to control plane
- 3a180df: Fix organization names for main tenant

### Patch Changes

- Updated dependencies [0f8e4e8]
- Updated dependencies [3a180df]
  - authhero@0.306.0

## 13.7.0

### Minor Changes

- aba8ef9: Handle org tokens for the main tenant

### Patch Changes

- Updated dependencies [aba8ef9]
  - authhero@0.305.0

## 13.6.0

### Minor Changes

- 1c36752: Use org tokens for tenants in admin

### Patch Changes

- Updated dependencies [1c36752]
  - authhero@0.304.0

## 13.5.0

### Minor Changes

- b778aed: Seed mananagement roles and create organizations

### Patch Changes

- Updated dependencies [b778aed]
  - authhero@0.303.0

## 13.4.0

### Minor Changes

- 283daf2: Refactor multi-tenancy package
- ae8553a: Add is_system to all adapters

### Patch Changes

- Updated dependencies [283daf2]
- Updated dependencies [ae8553a]
  - authhero@0.302.0
  - @authhero/adapter-interfaces@0.112.0

## 13.3.0

### Minor Changes

- e87ab70: Move tenants crud to multi-tenancy package

## 13.2.0

### Minor Changes

- 9e34783: Sync resource servers for multi tenancy setup

## 13.1.3

### Patch Changes

- Updated dependencies [906337d]
  - @authhero/adapter-interfaces@0.111.0

## 13.1.2

### Patch Changes

- Updated dependencies [a108525]
  - @authhero/adapter-interfaces@0.110.0

## 13.1.1

### Patch Changes

- Updated dependencies [1bec131]
  - @authhero/adapter-interfaces@0.109.0

## 13.1.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 13.0.0

### Patch Changes

- Updated dependencies [6929f98]
  - authhero@0.294.0

## 12.0.0

### Patch Changes

- Updated dependencies [85b58c4]
  - authhero@0.293.0

## 11.0.0

### Patch Changes

- Updated dependencies [973a72e]
  - authhero@0.292.0

## 10.0.2

### Patch Changes

- Updated dependencies [0e906aa]
  - @authhero/adapter-interfaces@0.108.0
  - authhero@0.291.2

## 10.0.1

### Patch Changes

- Updated dependencies [212f5c6]
  - @authhero/adapter-interfaces@0.107.0
  - authhero@0.291.1

## 10.0.0

### Patch Changes

- Updated dependencies [5ed04e5]
  - authhero@0.291.0

## 9.0.1

### Patch Changes

- Updated dependencies [f37644f]
  - @authhero/adapter-interfaces@0.106.0
  - authhero@0.290.1

## 9.0.0

### Patch Changes

- Updated dependencies [40caf1a]
  - @authhero/adapter-interfaces@0.105.0
  - authhero@0.290.0

## 8.0.0

### Patch Changes

- Updated dependencies [125dbb9]
  - @authhero/adapter-interfaces@0.104.0
  - authhero@0.289.0

## 7.0.0

### Patch Changes

- Updated dependencies [c51ab9b]
  - authhero@0.288.0

## 6.0.0

### Patch Changes

- Updated dependencies [b0c4421]
- Updated dependencies [c96d83b]
  - @authhero/adapter-interfaces@0.103.0
  - authhero@0.287.0

## 5.0.0

### Patch Changes

- Updated dependencies [65db836]
  - authhero@0.286.0

## 4.0.0

### Patch Changes

- Updated dependencies [e04bae4]
  - authhero@0.285.0

## 3.0.0

### Patch Changes

- Updated dependencies [6952865]
  - authhero@0.284.0

## 2.0.0

### Patch Changes

- Updated dependencies [0566155]
- Updated dependencies [0566155]
  - @authhero/adapter-interfaces@0.102.0
  - authhero@0.283.0

## 1.0.0

### Minor Changes

- 8ab05b4: Add multi-tenancy package

### Patch Changes

- Updated dependencies [8ab05b4]
  - authhero@0.282.0
