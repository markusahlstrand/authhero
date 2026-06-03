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

import { defineRoute } from "../../utils/define-route";
const headers = z.object({ "tenant-id": z.string().optional() });

const templateNameParam = z.object({
  templateName: emailTemplateNameSchema,
});

const partialBodySchema = emailTemplateSchema.partial();
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
    const body = ctx.req.valid("json");

    const existing = await ctx.env.data.emailTemplates.get(
      ctx.var.tenant_id,
      body.template,
    );
    if (existing) {
      throw new HTTPException(409, {
        message: "Email template already configured",
      });
    }

    const created = await ctx.env.data.emailTemplates.create(
      ctx.var.tenant_id,
      body,
    );

    await logMessage(ctx, ctx.var.tenant_id, {
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
    const out: { name: EmailTemplateName; body: string; subject: string }[] = [];
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
    const { templateName } = ctx.req.valid("param");
    const template = await ctx.env.data.emailTemplates.get(
      ctx.var.tenant_id,
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
            schema: emailTemplateSchema,
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
    const { templateName } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    if (body.template !== templateName) {
      throw new HTTPException(400, {
        message: "Body template must match URL templateName",
      });
    }

    const existing = await ctx.env.data.emailTemplates.get(
      ctx.var.tenant_id,
      templateName,
    );
    if (existing) {
      await ctx.env.data.emailTemplates.update(
        ctx.var.tenant_id,
        templateName,
        body,
      );
    } else {
      await ctx.env.data.emailTemplates.create(ctx.var.tenant_id, body);
    }

    const stored = await ctx.env.data.emailTemplates.get(
      ctx.var.tenant_id,
      templateName,
    );
    if (!stored) {
      throw new HTTPException(500, {
        message: `Email template not found after upsert (tenant_id=${ctx.var.tenant_id}, template=${templateName})`,
      });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
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
    const { templateName } = ctx.req.valid("param");
    const patch = ctx.req.valid("json");

    const updated = await ctx.env.data.emailTemplates.update(
      ctx.var.tenant_id,
      templateName,
      patch,
    );
    if (!updated) {
      throw new HTTPException(404, { message: "Email template not found" });
    }

    const stored = await ctx.env.data.emailTemplates.get(
      ctx.var.tenant_id,
      templateName,
    );
    if (!stored) {
      throw new HTTPException(404, { message: "Email template not found" });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Patch Email Template",
      targetType: "email_template",
      targetId: templateName,
    });

    return ctx.json(stored);
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
] as const);
