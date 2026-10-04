import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";

describe("u2 accept-invitation logging", () => {
  it("logs a successful signup when accepting creates the user", async () => {
    const { u2App, env } = await getTestServer();

    const organization = await env.data.organizations.create("tenantId", {
      name: "invite-org",
      display_name: "Invite Org",
    });
    const invite = await env.data.invites.create("tenantId", {
      organization_id: organization.id,
      inviter: { name: "Alice Inviter" },
      invitee: { email: "invited@example.com" },
      invitation_url: "https://example.com/invite",
      client_id: "clientId",
    });

    const acceptResponse = await u2App.request(
      `/accept-invitation?invitation=${invite.id}&organization=${organization.id}`,
      { headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(acceptResponse.status).toBe(302);
    const state = new URL(
      acceptResponse.headers.get("location")!,
      "https://example.com",
    ).searchParams.get("state")!;

    const response = await u2App.request(
      `/screen/accept-invitation?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: { password: "Password1!", re_password: "Password1!" },
        }),
      },
      env,
    );
    expect(response.status).toBe(200);

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: true,
    });
    expect(logs.filter((l) => l.type === "fi")).toHaveLength(0);
    const signups = logs.filter((l) => l.type === "ss");
    expect(signups).toHaveLength(1);
    expect(signups[0]?.user_name).toBe("invited@example.com");
    expect(signups[0]?.strategy_type).toBe("database");
  });
});
