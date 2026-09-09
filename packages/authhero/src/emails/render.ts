import { Context } from "hono";
import { Liquid } from "liquidjs";
import { EmailTemplateName } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { getDefaultTemplate } from "./defaults";

// Constructed on first render: the Liquid constructor is a measurable share
// of module-evaluation time, and most cold starts never send an email.
let liquidEngine: Liquid | undefined;
export function getLiquid(): Liquid {
  liquidEngine ??= new Liquid({
    cache: true,
    strictVariables: false,
    strictFilters: false,
  });
  return liquidEngine;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  from: string;
}

export type RenderResult =
  | { kind: "rendered"; email: RenderedEmail }
  /** Override exists and tenant explicitly disabled this template. */
  | { kind: "disabled" }
  /** No override and no bundled default — caller should use legacy inline HTML. */
  | { kind: "none" };

/**
 * Resolve and render an email template for the current tenant.
 *
 * Lookup order:
 *   1. Tenant override stored in `email_templates` (Auth0-compatible).
 *      If `enabled === false`, returns `{ kind: "disabled" }`.
 *   2. Bundled default (compiled from MJML at build time).
 *   3. `{ kind: "none" }` if neither exists.
 */
export async function renderEmailTemplate(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  templateName: EmailTemplateName,
  vars: Record<string, unknown>,
  fallbackFrom: string,
): Promise<RenderResult> {
  const override = await ctx.env.data.emailTemplates.get(
    ctx.var.tenant_id,
    templateName,
  );

  if (override && override.enabled === false) {
    return { kind: "disabled" };
  }

  const source = override
    ? { subject: override.subject, body: override.body }
    : getDefaultTemplate(templateName);

  if (!source) {
    return { kind: "none" };
  }

  const liquid = getLiquid();
  const [subject, html] = await Promise.all([
    liquid.parseAndRender(source.subject, vars),
    liquid.parseAndRender(source.body, vars),
  ]);

  return {
    kind: "rendered",
    email: {
      subject,
      html,
      from: override?.from || fallbackFrom,
    },
  };
}

/**
 * Render the bundled default template directly, without consulting the
 * adapter. Exposed for tests and tooling.
 */
export async function renderDefaultTemplate(
  templateName: EmailTemplateName,
  vars: Record<string, unknown>,
): Promise<{ subject: string; html: string } | null> {
  const fallback = getDefaultTemplate(templateName);
  if (!fallback) return null;
  const liquid = getLiquid();
  const [subject, html] = await Promise.all([
    liquid.parseAndRender(fallback.subject, vars),
    liquid.parseAndRender(fallback.body, vars),
  ]);
  return { subject, html };
}
