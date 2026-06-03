import { MiddlewareHandler } from "hono";
import { Variables } from "../types/Variables";

export const PREFER_TOKENS = ["include-linked"] as const;
export type PreferToken = (typeof PREFER_TOKENS)[number];

const VALID_TOKENS = new Set<string>(PREFER_TOKENS);

export interface PreferState {
  has(token: PreferToken): boolean;
  applied(token: PreferToken): void;
  appliedTokens(): PreferToken[];
}

function parsePreferHeader(value: string | undefined): Set<PreferToken> {
  const tokens = new Set<PreferToken>();
  if (!value) return tokens;

  for (const part of value.split(",")) {
    const name = part.split(";")[0]?.split("=")[0]?.trim().toLowerCase();
    if (name && VALID_TOKENS.has(name)) {
      tokens.add(name as PreferToken);
    }
  }
  return tokens;
}

export const preferMiddleware: MiddlewareHandler<{ Variables: Variables }> =
  async (ctx, next) => {
    const requested = parsePreferHeader(ctx.req.header("prefer"));
    const applied = new Set<PreferToken>();

    const state: PreferState = {
      has: (token) => requested.has(token),
      applied: (token) => {
        applied.add(token);
      },
      appliedTokens: () => Array.from(applied),
    };

    ctx.set("prefer", state);

    await next();

    if (applied.size > 0) {
      ctx.res.headers.set(
        "Preference-Applied",
        Array.from(applied).join(", "),
      );
    }
  };
