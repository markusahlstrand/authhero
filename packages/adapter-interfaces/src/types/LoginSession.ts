import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

// Login session state machine states
export enum LoginSessionState {
  /** Initial state - awaiting user authentication */
  PENDING = "pending",
  /** User credentials validated, but may need additional steps */
  AUTHENTICATED = "authenticated",
  /** Waiting for email verification */
  AWAITING_EMAIL_VERIFICATION = "awaiting_email_verification",
  /** Waiting for hook/flow completion (form, page redirect) */
  AWAITING_HOOK = "awaiting_hook",
  /** Tokens issued successfully */
  COMPLETED = "completed",
  /** Authentication failed (wrong password, blocked, etc.) */
  FAILED = "failed",
  /** Session timed out */
  EXPIRED = "expired",
}

export const loginSessionStateSchema = z.nativeEnum(LoginSessionState);

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
    state: loginSessionStateSchema.optional().default(LoginSessionState.PENDING),
    state_data: z.string().optional(), // JSON string of state machine context
    failure_reason: z.string().optional(),
    user_id: z.string().optional(), // Set once user is authenticated
  })
  .openapi({
    description: "This represents a login sesion",
  });

export type LoginSessionInsert = z.input<typeof loginSessionInsertSchema>;

export const loginSessionSchema = z.object({
  ...loginSessionInsertSchema.shape,
  id: z.string().openapi({
    description: "This is is used as the state in the universal login",
  }),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LoginSession = z.infer<typeof loginSessionSchema>;
