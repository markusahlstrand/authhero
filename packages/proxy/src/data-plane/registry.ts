import type { MiddlewareHandler } from "hono";
import { z } from "@hono/zod-openapi";

export interface HandlerBuildContext {
  bindings: Record<string, unknown>;
}

export interface HandlerDefinition<TOptions = unknown> {
  type: string;
  optionsSchema: z.ZodType<TOptions>;
  build(options: TOptions, ctx: HandlerBuildContext): MiddlewareHandler;
}

export class HandlerRegistry {
  private definitions = new Map<string, HandlerDefinition>();
  private bindings: Record<string, unknown>;

  constructor(bindings: Record<string, unknown> = {}) {
    this.bindings = bindings;
  }

  add<TOptions>(def: HandlerDefinition<TOptions>): this {
    this.definitions.set(def.type, def as HandlerDefinition);
    return this;
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  build(type: string, rawOptions: unknown): MiddlewareHandler {
    const def = this.definitions.get(type);
    if (!def) {
      throw new Error(`Unknown proxy handler type: ${type}`);
    }
    const parsed = def.optionsSchema.safeParse(rawOptions);
    if (!parsed.success) {
      throw new Error(
        `Invalid options for proxy handler "${type}": ${parsed.error.message}`,
      );
    }
    return def.build(parsed.data, { bindings: this.bindings });
  }
}

export function defineHandler<TOptions>(
  def: HandlerDefinition<TOptions>,
): HandlerDefinition<TOptions> {
  return def;
}
