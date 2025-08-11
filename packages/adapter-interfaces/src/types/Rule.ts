import { z } from "@hono/zod-openapi";

// Rule payload used when creating/updating a rule
export const ruleInsertSchema = z.object({
  name: z.string(),
  script: z.string(),
  order: z.number().int().optional(),
  enabled: z.boolean().optional(),
  // Auth0 currently returns "login_success" for rules; keep as string for forward compatibility
  stage: z.string().optional(),
});
export type RuleInsert = z.input<typeof ruleInsertSchema>;

// Full Rule as returned by Management API (Get Rule by ID/List Rules)
export const ruleSchema = z
  .object({
    id: z.string(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    ...ruleInsertSchema.shape,
  })
  .passthrough();
export type Rule = z.infer<typeof ruleSchema>;

export const ruleListSchema = z.array(ruleSchema);
export type RuleList = z.infer<typeof ruleListSchema>;
