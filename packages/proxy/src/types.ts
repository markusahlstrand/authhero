import { z } from "@hono/zod-openapi";

export const middlewareConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cors"),
    origins: z.array(z.string()).optional(),
    allow_credentials: z.boolean().optional(),
    allow_headers: z.array(z.string()).optional(),
    allow_methods: z.array(z.string()).optional(),
    expose_headers: z.array(z.string()).optional(),
    max_age: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("headers"),
    request: z.record(z.string(), z.string()).optional(),
    response: z.record(z.string(), z.string()).optional(),
    remove_request: z.array(z.string()).optional(),
    remove_response: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("basic_auth"),
    username: z.string(),
    password: z.string(),
    realm: z.string().optional(),
  }),
  z.object({
    type: z.literal("cache"),
    ttl_seconds: z.number().int().positive(),
  }),
]);

export type MiddlewareConfig = z.infer<typeof middlewareConfigSchema>;

export const proxyRouteInsertSchema = z.object({
  custom_domain_id: z.string(),
  priority: z.number().int().default(100),
  path_pattern: z.string(),
  upstream_type: z.enum(["http", "authhero", "redirect"]),
  upstream_url: z.string(),
  preserve_host: z.boolean().default(false),
  middleware: z.array(middlewareConfigSchema).default([]),
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
