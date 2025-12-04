import { Context } from "hono";
import { Bindings, Variables } from "../types";

/**
 * Appends a message to the ctx.var.log variable.
 * If a log already exists, the new message is appended with a newline separator.
 */
export function appendLog(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  message: string,
): void {
  const existingLog = ctx.var.log;
  if (existingLog) {
    ctx.set("log", `${existingLog}\n${message}`);
  } else {
    ctx.set("log", message);
  }
}
