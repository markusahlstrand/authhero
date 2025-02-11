import { z } from "@hono/zod-openapi";
import { deviceSchema } from "./Device";

export const sessionInsertSchema = z.object({
  id: z.string(),
  // TODO: Remove once data migrated
  session_id: z.string().optional(),
  client_id: z.string(),
  revoked_at: z.string().optional(),
  used_at: z.string(),
  user_id: z.string().describe("The user ID associated with the session"),
  expires_at: z.string().optional(),
  idle_expires_at: z.string().optional(),
  device: deviceSchema.describe(
    "Metadata related to the device used in the session",
  ),
  clients: z
    .array(z.string())
    .describe("List of client details for the session"),
});

export type SessionInsert = z.infer<typeof sessionInsertSchema>;

export const sessionSchema = z.object({
  created_at: z.string(),
  updated_at: z.string(),
  authenticated_at: z.string(),
  last_interaction_at: z.string(),
  ...sessionInsertSchema.shape,
});

export type Session = z.infer<typeof sessionSchema>;
