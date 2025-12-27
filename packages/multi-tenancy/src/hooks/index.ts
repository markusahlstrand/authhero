export {
  createAccessControlHooks,
  validateTenantAccess,
} from "./access-control";
export { createDatabaseHooks, type DatabaseFactory } from "./database";
export { createProvisioningHooks } from "./provisioning";
export {
  createResourceServerSyncHooks,
  createTenantResourceServerSyncHooks,
  type ResourceServerSyncConfig,
  type ResourceServerEntityHooks,
  type TenantResourceServerSyncConfig,
} from "./resource-server-sync";
export {
  createRoleSyncHooks,
  createTenantRoleSyncHooks,
  type RoleSyncConfig,
  type RoleEntityHooks,
  type TenantRoleSyncConfig,
} from "./role-sync";
