export interface InvitationPayloadInput {
  organizationId: string;
  clientId: string;
  email: string;
  inviterName?: string;
  sendInvitationEmail: boolean;
}

/**
 * Builds the request body for `POST /organizations/{id}/invitations`.
 *
 * The backend requires a non-null `inviter` object (its `name` is optional) and
 * a `client_id` used to build the acceptance link. The email is trimmed to
 * match what the user sees in the input.
 */
export function buildInvitationPayload(input: InvitationPayloadInput) {
  const { organizationId, clientId, email, inviterName, sendInvitationEmail } =
    input;
  return {
    organization_id: organizationId,
    client_id: clientId,
    invitee: { email: email.trim() },
    inviter: inviterName ? { name: inviterName } : {},
    send_invitation_email: sendInvitationEmail,
  };
}
