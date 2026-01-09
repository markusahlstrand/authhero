import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

/**
 * Pipeline state tracks progress through post-login hooks.
 * This implements Auth0-style suspend/resume for forms, pages, and actions.
 */
export const pipelineStateSchema = z.object({
  // Which hooks have completed (index in the hooks array)
  position: z.number().default(0),

  // Current suspension state - null means not suspended, evaluate next hook
  current: z
    .object({
      type: z.enum(["form", "page", "action"]),
      id: z.string(), // form_id, page_id, or action index
      step: z.string().optional(), // Current node for forms
      return_to: z.string().optional(), // Where to return after sub-flow (e.g., form node after change-email)
    })
    .nullable()
    .default(null),

  // Transaction metadata - persists across entire pipeline
  context: z.record(z.unknown()).default({}),
});

export type PipelineState = z.infer<typeof pipelineStateSchema>;

export const loginSessionInsertSchema = z
  .object({
    csrf_token: z.string(),
    auth0Client: z.string().optional(),
    authParams: authParamsSchema,
    expires_at: z.string(),
    deleted_at: z.string().optional(),
    ip: z.string().optional(),
    useragent: z.string().optional(),
    session_id: z.string().optional(),
    authorization_url: z.string().optional(),
    // Pipeline state for post-login hooks (forms, pages, actions)
    // Default to position 0, not suspended, empty context
    pipeline_state: pipelineStateSchema.default({
      position: 0,
      current: null,
      context: {},
    }),
  })
  .openapi({
    description: "This represents a login sesion",
  });

export type LoginSessionInsert = z.input<typeof loginSessionInsertSchema>;

export const loginSessionSchema = loginSessionInsertSchema.extend({
  id: z.string().openapi({
    description: "This is is used as the state in the universal login",
  }),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LoginSession = z.infer<typeof loginSessionSchema>;
