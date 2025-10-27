import { z } from "@hono/zod-openapi";

export const inviterSchema = z.object({
  name: z.string().optional(),
});

export type Inviter = z.infer<typeof inviterSchema>;

export const inviteeSchema = z.object({
  email: z.string().optional(),
});

export type Invitee = z.infer<typeof inviteeSchema>;

export const inviteInsertSchema = z.object({
  organization_id: z.string().max(50).optional(), // Made optional so it can be set from the route
  inviter: inviterSchema,
  invitee: inviteeSchema,
  client_id: z.string(),
  connection_id: z.string().optional(),
  app_metadata: z.record(z.any()).default({}).optional(),
  user_metadata: z.record(z.any()).default({}).optional(),
  ttl_sec: z.number().int().max(2592000).default(604800).optional(),
  roles: z.array(z.string()).default([]).optional(),
  send_invitation_email: z.boolean().default(true).optional(),
});

export type InviteInsert = z.infer<typeof inviteInsertSchema>;

export const inviteSchema = z
  .object({
    id: z.string(),
    organization_id: z.string().max(50),
    invitation_url: z.string().url(),
    created_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    ticket_id: z.string().optional(),
  })
  .extend(inviteInsertSchema.shape);

export type Invite = z.infer<typeof inviteSchema>;
