import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  emailTemplateNameSchema,
  emailTemplateSchema,
  LogTypes,
  type EmailTemplateName,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { HTTPException } from "hono/http-exception";
import { getDefaultTemplate } from "../../emails/defaults";
import { sendTestEmail } from "../../emails";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
const headers = z.object({ "tenant-id": z.string().optional() });

const templateNameParam = z.object({
  templateName: emailTemplateNameSchema,
});

const partialBodySchema = emailTemplateSchema.partial();
// `from` is optional in the API: at send time we fall back to the email
// provider's default_from_address when it's blank. This is an authhero
// extension to Auth0's contract, where `from` is required.
const putBodySchema = emailTemplateSchema.extend({
  from: emailTemplateSchema.shape.from.optional(),
});
const postRoot = defineRoute({
  route: createRoute({
    tags: ["email-templates"],
    method: "post",
    path: "/",
    request: {
      headers,
      body: {
        content: {
          "application/json": {
            schema: emailTemplateSchema,
          },
        },
      },
    },
    security: [{ Bearer: ["create:email_templates"] }],
    responses: {
      201: {
        content: { "application/json": { schema: emailTemplateSchema } },
        description: "Email template",
      },
      409: { description: "Template already exists" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const body = ctx.req.valid("json");

    const existing = await ctx.env.data.emailTemplates.get(
      tenantId,
      body.template,
    );
    if (existing) {
      throw new HTTPException(409, {
        message: "Email template already configured",
      });
    }

    const created = await ctx.env.data.emailTemplates.create(tenantId, body);

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create Email Template",
      targetType: "email_template",
      targetId: body.template,
    });

    return ctx.json(created, { status: 201 });
  },
});

const defaultsItemSchema = z.object({
  name: emailTemplateNameSchema,
  body: z.string(),
  subject: z.string(),
});

const getDefaults = defineRoute({
  route: createRoute({
    tags: ["email-templates"],
    method: "get",
    path: "/defaults",
    request: { headers },
    security: [{ Bearer: ["read:email_templates"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(defaultsItemSchema),
          },
        },
        description:
          "Bundled default email templates shipped with authhero. authhero extension; not available in Auth0.",
      },
    },
  }),
  handler: async (ctx) => {
    const out: { name: EmailTemplateName; body: string; subject: string }[] =
      [];
    for (const name of emailTemplateNameSchema.options) {
      const def = getDefaultTemplate(name);
      if (def) out.push({ name, body: def.body, subject: def.subject });
    }
    return ctx.json(out);
  },
});

const getByTemplateName = defineRoute({
  route: createRoute({
    tags: ["email-templates"],
    method: "get",
    path: "/{templateName}",
    request: {
      headers,
      params: templateNameParam,
    },
    security: [{ Bearer: ["read:email_templates"] }],
    responses: {
      200: {
        content: { "application/json": { schema: emailTemplateSchema } },
        description: "Email template",
      },
      404: { description: "Template not found" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { templateName } = ctx.req.valid("param");
    const template = await ctx.env.data.emailTemplates.get(
      tenantId,
      templateName,
    );
    if (!template) {
      throw new HTTPException(404, { message: "Email template not found" });
    }
    return ctx.json(template);
  },
});

const putByTemplateName = defineRoute({
  route: createRoute({
    tags: ["email-templates"],
    method: "put",
    path: "/{templateName}",
    request: {
      headers,
      params: templateNameParam,
      body: {
        content: {
          "application/json": {
            schema: putBodySchema,
          },
        },
      },
    },
    security: [{ Bearer: ["update:email_templates"] }],
    responses: {
      200: {
        content: { "application/json": { schema: emailTemplateSchema } },
        description: "Email template upserted",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { templateName } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    if (body.template !== templateName) {
      throw new HTTPException(400, {
        message: "Body template must match URL templateName",
      });
    }

    const normalizedFrom = body.from?.trim() ?? "";
    const normalized = { ...body, from: normalizedFrom };

    const existing = await ctx.env.data.emailTemplates.get(
      tenantId,
      templateName,
    );
    if (existing) {
      await ctx.env.data.emailTemplates.update(
        tenantId,
        templateName,
        normalized,
      );
    } else {
      await ctx.env.data.emailTemplates.create(tenantId, normalized);
    }

    const stored = await ctx.env.data.emailTemplates.get(
      tenantId,
      templateName,
    );
    if (!stored) {
      throw new HTTPException(500, {
        message: `Email template not found after upsert (tenant_id=${tenantId}, template=${templateName})`,
      });
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update Email Template",
      targetType: "email_template",
      targetId: templateName,
    });

    return ctx.json(stored);
  },
});

const patchByTemplateName = defineRoute({
  route: createRoute({
    tags: ["email-templates"],
    method: "patch",
    path: "/{templateName}",
    request: {
      headers,
      params: templateNameParam,
      body: {
        content: {
          "application/json": { schema: partialBodySchema },
        },
      },
    },
    security: [{ Bearer: ["update:email_templates"] }],
    responses: {
      200: {
        content: { "application/json": { schema: emailTemplateSchema } },
        description: "Email template",
      },
      404: { description: "Template not found" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { templateName } = ctx.req.valid("param");
    const patch = ctx.req.valid("json");

    const updated = await ctx.env.data.emailTemplates.update(
      tenantId,
      templateName,
      patch,
    );
    if (!updated) {
      throw new HTTPException(404, { message: "Email template not found" });
    }

    const stored = await ctx.env.data.emailTemplates.get(
      tenantId,
      templateName,
    );
    if (!stored) {
      throw new HTTPException(404, { message: "Email template not found" });
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Patch Email Template",
      targetType: "email_template",
      targetId: templateName,
    });

    return ctx.json(stored);
  },
});

const deleteByTemplateName = defineRoute({
  route: createRoute({
    tags: ["email-templates"],
    method: "delete",
    path: "/{templateName}",
    request: {
      headers,
      params: templateNameParam,
    },
    // authhero extension: DELETE clears the tenant override and reverts to the
    // bundled default — semantically an update, not a destructive delete — so
    // it piggybacks on update:email_templates rather than introducing a
    // delete:email_templates scope that Auth0 doesn't define.
    security: [{ Bearer: ["update:email_templates"] }],
    responses: {
      204: {
        description:
          "Tenant override removed; subsequent sends use the bundled default. authhero extension; not available in Auth0.",
      },
      404: { description: "Template override not found" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { templateName } = ctx.req.valid("param");

    const removed = await ctx.env.data.emailTemplates.remove(
      tenantId,
      templateName,
    );
    if (!removed) {
      throw new HTTPException(404, { message: "Email template not found" });
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete Email Template",
      targetType: "email_template",
      targetId: templateName,
    });

    return ctx.body(null, 204);
  },
});

const tryBodySchema = z.object({
  to: z.string().email(),
  body: z.string().optional(),
  subject: z.string().optional(),
  from: z.string().optional(),
  language: z.string().optional(),
});

const tryByTemplateName = defineRoute({
  route: createRoute({
    tags: ["email-templates"],
    method: "post",
    path: "/{templateName}/try",
    request: {
      headers,
      params: templateNameParam,
      body: {
        content: {
          "application/json": { schema: tryBodySchema },
        },
      },
    },
    security: [{ Bearer: ["update:email_templates"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ sent: z.boolean() }),
          },
        },
        description:
          "Sends a test email rendered with sample data. authhero extension; not available in Auth0.",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { templateName } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const trimmedFrom = body.from?.trim();
    await sendTestEmail(ctx, {
      to: body.to,
      templateName,
      body: body.body,
      subject: body.subject,
      from: trimmedFrom !== "" ? trimmedFrom : undefined,
      language: body.language,
    });

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: `Test Email Sent (${templateName})`,
      targetType: "email_template",
      targetId: templateName,
    });

    return ctx.json({ sent: true });
  },
});

export const emailTemplatesRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  postRoot,
  getDefaults,
  getByTemplateName,
  putByTemplateName,
  patchByTemplateName,
  deleteByTemplateName,
  tryByTemplateName,
] as const);
