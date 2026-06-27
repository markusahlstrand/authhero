import { describe, it, expect } from "vitest";
import { buildInvitationPayload } from "./inviteMember";

const base = {
  organizationId: "org_1",
  clientId: "client_123",
  email: "new.user@example.com",
  sendInvitationEmail: true,
};

describe("buildInvitationPayload", () => {
  it("includes the organization id, client id and invitee email", () => {
    expect(buildInvitationPayload(base)).toMatchObject({
      organization_id: "org_1",
      client_id: "client_123",
      invitee: { email: "new.user@example.com" },
      send_invitation_email: true,
    });
  });

  it("sends an empty inviter object when no name is provided", () => {
    // The backend requires a non-null inviter object even without a name.
    expect(buildInvitationPayload(base).inviter).toEqual({});
  });

  it("includes the inviter name when provided", () => {
    expect(
      buildInvitationPayload({ ...base, inviterName: "Ada Lovelace" }).inviter,
    ).toEqual({ name: "Ada Lovelace" });
  });

  it("trims surrounding whitespace from the email", () => {
    expect(
      buildInvitationPayload({ ...base, email: "  spaced@example.com  " })
        .invitee.email,
    ).toBe("spaced@example.com");
  });

  it("propagates send_invitation_email = false", () => {
    expect(
      buildInvitationPayload({ ...base, sendInvitationEmail: false })
        .send_invitation_email,
    ).toBe(false);
  });
});
