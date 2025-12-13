import { z } from "@hono/zod-openapi";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "./AuthParams";

/**
 * TypeScript interface for known connection options.
 * The actual schema uses z.record(z.any()) to allow flexibility
 * for different connection strategies.
 */
export interface ConnectionOptions {
  // OAuth/OIDC options
  kid?: string;
  team_id?: string;
  realms?: string;
  authentication_method?: string;
  client_id?: string;
  client_secret?: string;
  app_secret?: string;
  scope?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  discovery_url?: string;
  issuer?: string;
  provider?: string;
  // SMS options
  from?: string;
  twilio_sid?: string;
  twilio_token?: string;
  // UI options
  icon_url?: string;
  // Password policy options (for database connections)
  passwordPolicy?: "none" | "low" | "fair" | "good" | "excellent";
  password_complexity_options?: {
    min_length?: number;
  };
  password_history?: {
    enable?: boolean;
    size?: number | null;
  };
  password_no_personal_info?: {
    enable?: boolean;
  };
  password_dictionary?: {
    enable?: boolean;
    dictionary?: string[];
  };
  // Allow additional properties for different connection strategies
  [key: string]: unknown;
}

// Use z.record for flexibility with different connection strategies
export const connectionOptionsSchema = z.record(z.any());

export const connectionInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  display_name: z.string().optional(),
  strategy: z.string(),
  options: connectionOptionsSchema.default({}),
  enabled_clients: z.array(z.string()).default([]).optional(),
  response_type: z.custom<AuthorizationResponseType>().optional(),
  response_mode: z.custom<AuthorizationResponseMode>().optional(),
  is_domain_connection: z.boolean().optional(),
  show_as_button: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});
export type ConnectionInsert = z.infer<typeof connectionInsertSchema>;

export const connectionSchema = z
  .object({
    id: z.string(),
    created_at: z.string().transform((val) => (val === null ? "" : val)),
    updated_at: z.string().transform((val) => (val === null ? "" : val)),
  })
  .extend(connectionInsertSchema.shape);

export type Connection = z.infer<typeof connectionSchema>;
