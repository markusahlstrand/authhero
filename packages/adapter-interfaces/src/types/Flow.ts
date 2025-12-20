import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

/**
 * Flow action types supported by the system (Auth0 compatible)
 * For now we support AUTH0 and EMAIL types
 */
export const FlowActionTypeEnum = z.enum(["AUTH0", "EMAIL"]);

export type FlowActionType = z.infer<typeof FlowActionTypeEnum>;

/**
 * AUTH0 action operations
 */
export const Auth0ActionEnum = z.enum([
  "CREATE_USER",
  "GET_USER",
  "UPDATE_USER",
  "SEND_REQUEST",
  "SEND_EMAIL",
]);

/**
 * EMAIL action operations
 */
export const EmailActionEnum = z.enum(["VERIFY_EMAIL"]);

/**
 * Email verification rules schema
 */
export const emailVerificationRulesSchema = z.object({
  require_mx_record: z.boolean().optional(),
  block_aliases: z.boolean().optional(),
  block_free_emails: z.boolean().optional(),
  block_disposable_emails: z.boolean().optional(),
  blocklist: z.array(z.string()).optional(),
  allowlist: z.array(z.string()).optional(),
});

export type EmailVerificationRules = z.infer<
  typeof emailVerificationRulesSchema
>;

/**
 * AUTH0 UPDATE_USER action step
 */
export const auth0UpdateUserActionSchema = z.object({
  id: z.string(),
  alias: z.string().max(100).optional(),
  type: z.literal("AUTH0"),
  action: z.literal("UPDATE_USER"),
  allow_failure: z.boolean().optional(),
  mask_output: z.boolean().optional(),
  params: z.object({
    connection_id: z.string().optional(),
    user_id: z.string(),
    changes: z.record(z.string(), z.any()),
  }),
});

export type Auth0UpdateUserAction = z.infer<typeof auth0UpdateUserActionSchema>;

/**
 * EMAIL VERIFY_EMAIL action step
 */
export const emailVerifyActionSchema = z.object({
  id: z.string(),
  alias: z.string().max(100).optional(),
  type: z.literal("EMAIL"),
  action: z.literal("VERIFY_EMAIL"),
  allow_failure: z.boolean().optional(),
  mask_output: z.boolean().optional(),
  params: z.object({
    email: z.string(),
    rules: emailVerificationRulesSchema.optional(),
  }),
});

export type EmailVerifyAction = z.infer<typeof emailVerifyActionSchema>;

/**
 * Union of all supported action steps
 */
export const flowActionStepSchema = z.union([
  auth0UpdateUserActionSchema,
  emailVerifyActionSchema,
]);

export type FlowActionStep = z.infer<typeof flowActionStepSchema>;

/**
 * Schema for creating a flow
 */
export const flowInsertSchema = z.object({
  name: z.string().min(1).max(150).openapi({
    description: "The name of the flow",
  }),
  // Actions is an array of action steps (Auth0 stores as JSON blob)
  actions: z.array(flowActionStepSchema).optional().default([]).openapi({
    description: "The list of actions to execute in sequence",
  }),
});

export type FlowInsert = z.infer<typeof flowInsertSchema>;

/**
 * Full flow schema including system fields
 */
export const flowSchema = flowInsertSchema.extend({
  ...baseEntitySchema.shape,
  id: z.string().openapi({
    description: "Unique identifier for the flow",
    example: "af_12tMpdJ3iek7svMyZkSh5M",
  }),
});

export type Flow = z.infer<typeof flowSchema>;
