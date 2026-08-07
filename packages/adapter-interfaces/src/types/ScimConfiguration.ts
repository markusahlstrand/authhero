import { z } from "@hono/zod-openapi";

/**
 * One attribute-mapping entry translating a SCIM resource attribute to an
 * AuthHero user field. Mirrors Auth0's SCIM `mapping` shape (`{ scim, auth0 }`).
 */
export const scimMappingEntrySchema = z.object({
  scim: z.string(),
  auth0: z.string(),
});

export type ScimMappingEntry = z.infer<typeof scimMappingEntrySchema>;

export const scimConfigurationInsertSchema = z.object({
  connection_id: z.string(),
  // Which SCIM attribute AuthHero treats as the stable external identifier.
  // Auth0 defaults to `externalId` for most strategies.
  user_id_attribute: z.string().default("externalId"),
  mapping: z.array(scimMappingEntrySchema).default([]),
});

export type ScimConfigurationInsert = z.infer<
  typeof scimConfigurationInsertSchema
>;

export const scimConfigurationSchema = z
  .object({
    created_at: z.string(),
    updated_at: z.string(),
  })
  .extend(scimConfigurationInsertSchema.shape);

export type ScimConfiguration = z.infer<typeof scimConfigurationSchema>;
