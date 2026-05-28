import { z } from "@hono/zod-openapi";

export const matchSchema = z.object({
  hosts: z.array(z.string()).optional(),
  methods: z.array(z.string()).optional(),
  path: z.string().default("/*"),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
});

export type RouteMatch = z.infer<typeof matchSchema>;

export const handlerConfigSchema = z.object({
  type: z.string(),
  options: z.record(z.string(), z.unknown()).default({}),
});

export type HandlerConfig = z.infer<typeof handlerConfigSchema>;

export const proxyRouteInsertSchema = z.object({
  custom_domain_id: z.string(),
  priority: z.number().int().default(100),
  match: matchSchema,
  handlers: z.array(handlerConfigSchema).min(1),
});

export type ProxyRouteInsert = z.infer<typeof proxyRouteInsertSchema>;

export const proxyRouteSchema = proxyRouteInsertSchema.extend({
  id: z.string(),
  tenant_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ProxyRoute = z.infer<typeof proxyRouteSchema>;

export const proxyRouteUpdateSchema = proxyRouteInsertSchema.partial().omit({
  custom_domain_id: true,
});

export type ProxyRouteUpdate = z.infer<typeof proxyRouteUpdateSchema>;
