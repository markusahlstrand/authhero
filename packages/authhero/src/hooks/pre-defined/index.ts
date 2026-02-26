/**
 * Pre-defined hooks library for AuthHero.
 *
 * These are ready-to-use hooks that implement common authentication patterns.
 * Users can connect them via the `hooks` configuration in AuthHeroConfig.
 *
 * @example
 * ```typescript
 * import { init, preDefinedHooks } from "authhero";
 *
 * const { app } = init({
 *   dataAdapter,
 *   hooks: {
 *     onExecutePostLogin: preDefinedHooks.ensureUsername(),
 *   },
 * });
 * ```
 */
export { ensureUsername } from "./ensure-username";
export type { EnsureUsernameOptions } from "./ensure-username";
export { setPreferredUsername } from "./set-preferred-username";
