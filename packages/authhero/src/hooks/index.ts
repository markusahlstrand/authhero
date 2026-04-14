/**
 * Public surface of the hooks subsystem. Implementation lives in sibling
 * files split by trigger:
 *   - user-registration.ts  — createUserHooks (decorator applied to users.create)
 *   - user-update.ts        — createUserUpdateHooks (decorator applied to users.update)
 *   - user-deletion.ts      — createUserDeletionHooks (decorator applied to users.remove)
 *   - validate-signup.ts    — validateSignupEmail + preUserSignupHook
 *   - post-user-login.ts    — postUserLoginHook (+ Auth0-compat event builder)
 *   - addDataHooks.ts       — the decorator assembler wrapped around a DataAdapters
 *   - helpers/token-api.ts  — createTokenAPI, shared by every trigger
 *
 * Internal implementation helpers (`createUserHooks`, `createUserUpdateHooks`,
 * `createUserDeletionHooks`) are intentionally NOT re-exported — callers go
 * through `addDataHooks`.
 */
export { addDataHooks } from "./addDataHooks";
export {
  validateSignupEmail,
  preUserSignupHook,
} from "./validate-signup";
export { postUserLoginHook } from "./post-user-login";

// Backwards compatibility aliases
export { validateSignupEmail as validateRegistrationUsername } from "./validate-signup";
export { preUserSignupHook as preUserRegistrationHook } from "./validate-signup";
