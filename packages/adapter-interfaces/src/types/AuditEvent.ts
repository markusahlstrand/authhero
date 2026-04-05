import { z } from "@hono/zod-openapi";

export const auditCategorySchema = z.enum([
  "user_action",
  "admin_action",
  "system",
  "api",
]);

export type AuditCategory = z.infer<typeof auditCategorySchema>;

export const actorSchema = z.object({
  type: z.enum(["user", "admin", "system", "api_key", "client_credentials"]),
  id: z.string().optional(),
  email: z.string().optional(),
  org_id: z.string().optional(),
  org_name: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  client_id: z.string().optional(),
});

export type Actor = z.infer<typeof actorSchema>;

export const targetSchema = z.object({
  type: z.string(),
  id: z.string(),
  before: z.record(z.unknown()).optional(),
  after: z.record(z.unknown()).optional(),
  diff: z.record(z.object({ old: z.unknown(), new: z.unknown() })).optional(),
});

export type Target = z.infer<typeof targetSchema>;

export const requestContextSchema = z.object({
  method: z.string(),
  path: z.string(),
  query: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  ip: z.string(),
  user_agent: z.string().optional(),
  correlation_id: z.string().optional(),
});

export type RequestContext = z.infer<typeof requestContextSchema>;

export const responseContextSchema = z.object({
  status_code: z.number(),
  body: z.unknown().optional(),
});

export type ResponseContext = z.infer<typeof responseContextSchema>;

export const locationInfoSchema = z.object({
  country_code: z.string(),
  city_name: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  time_zone: z.string(),
  continent_code: z.string(),
});

export const auth0ClientSchema = z.object({
  name: z.string(),
  version: z.string(),
  env: z.record(z.string()).optional(),
});

export const auditEventInsertSchema = z.object({
  tenant_id: z.string(),
  event_type: z.string(),
  log_type: z.string(),
  description: z.string().optional(),
  category: auditCategorySchema,

  actor: actorSchema,
  target: targetSchema,
  request: requestContextSchema,
  response: responseContextSchema.optional(),

  connection: z.string().optional(),
  strategy: z.string().optional(),
  strategy_type: z.string().optional(),

  location: locationInfoSchema.optional(),
  auth0_client: auth0ClientSchema.optional(),
  hostname: z.string(),
  is_mobile: z.boolean().optional(),

  timestamp: z.string(),
});

export type AuditEventInsert = z.infer<typeof auditEventInsertSchema>;

export const auditEventSchema = auditEventInsertSchema.extend({
  id: z.string(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
