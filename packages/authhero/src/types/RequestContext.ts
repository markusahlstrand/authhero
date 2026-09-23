import type { Context } from "hono";
import type { Bindings } from "./Bindings";
import type { Variables } from "./Variables";

/**
 * The part of a request context the email, logging and service-token helpers
 * use. Every `Variables` entry is optional, so a context that sets only some of
 * them (such as the proxy control-plane resource) can call these helpers too.
 * The app's full `Context<{ Bindings; Variables }>` is assignable to it.
 */
export type RequestContext = Pick<
  Context<{ Bindings: Bindings; Variables: Partial<Variables> }>,
  "env" | "var" | "req" | "executionCtx"
> & {
  set(key: "outboxEventPromises", value: Promise<string>[]): void;
  set(key: "backgroundPromises", value: Promise<void>[]): void;
};
