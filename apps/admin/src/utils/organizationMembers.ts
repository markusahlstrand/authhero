function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

/**
 * Resolves the organization id and member user ids for a
 * `dataProvider.delete("organization-members", ...)` call.
 *
 * The record id is never parsed: member list records use a
 * `${organization_id}_${user_id}` composite id, but organization ids
 * themselves contain underscores (`org_...`), so splitting on `_` shreds the
 * organization id (e.g. `org_abc` became organization `org` + user `abc`,
 * yielding a 404). The record fields in `previousData` are authoritative.
 */
export function resolveOrganizationMemberDeletion(params: {
  id: string | number;
  previousData?: Record<string, unknown>;
}): { organization_id: string; user_ids: string[] } {
  const previous = params.previousData;

  const organization_id =
    typeof previous?.organization_id === "string" && previous.organization_id
      ? previous.organization_id
      : String(params.id);
  const user_ids =
    stringArray(previous?.members) ??
    stringArray(previous?.user_ids) ??
    (typeof previous?.user_id === "string" && previous.user_id
      ? [previous.user_id]
      : []);

  if (!organization_id || user_ids.length === 0) {
    throw new Error(
      "Missing organization_id or user_id(s) for organization member deletion",
    );
  }

  return { organization_id, user_ids };
}
