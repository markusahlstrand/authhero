import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { addDataHooks } from "../hooks";

export function getDataAdapter(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return addDataHooks(ctx, ctx.env.data);
}
