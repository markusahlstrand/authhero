import { describe, it, expect, vi } from "vitest";
import { setPreferredUsername } from "../../src/hooks/pre-defined/set-preferred-username";
import type {
  HookEvent,
  OnExecuteCredentialsExchangeAPI,
} from "../../src/types/Hooks";

function createMockApi() {
  return {
    idToken: {
      setCustomClaim: vi.fn(),
    },
    accessToken: {
      setCustomClaim: vi.fn(),
    },
    access: {
      deny: vi.fn(),
    },
    token: {
      createServiceToken: vi.fn(),
    },
  } as unknown as OnExecuteCredentialsExchangeAPI;
}

function createMockEvent(
  user: Partial<HookEvent["user"]> | undefined,
): HookEvent {
  return {
    ctx: {
      env: { data: {} },
      var: { tenant_id: "test-tenant" },
      req: { header: vi.fn() },
    },
    user: user
      ? {
          user_id: "email|123",
          provider: "email",
          connection: "email",
          is_social: false,
          email_verified: true,
          login_count: 1,
          ...user,
        }
      : undefined,
    tenant: { id: "test-tenant" },
  } as unknown as HookEvent;
}

describe("setPreferredUsername", () => {
  it("sets preferred_username from user.username", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent({
      user_id: "auth2|123",
      provider: "auth2",
      username: "john",
    });

    await hook(event, api);

    expect(api.idToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "john",
    );
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "john",
    );
  });

  it("sets preferred_username from user.preferred_username", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent({
      preferred_username: "johnny",
    });

    await hook(event, api);

    expect(api.idToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "johnny",
    );
  });

  it("prefers user.username over preferred_username", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent({
      username: "john",
      preferred_username: "johnny",
    });

    await hook(event, api);

    expect(api.idToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "john",
    );
  });

  it("resolves username from linked identity's top-level username field", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent({
      user_id: "email|123",
      provider: "email",
      // No username or preferred_username on the primary user
      identities: [
        {
          connection: "email",
          provider: "email",
          user_id: "123",
          isSocial: false,
        },
        {
          connection: "Username-Password-Authentication",
          provider: "auth2",
          user_id: "456",
          isSocial: false,
          username: "john",
          // Note: username is at the top level of the identity, NOT inside profileData.
          // This is how the kysely adapter builds identities via userToIdentity.
          profileData: {
            email_verified: false,
          },
        },
      ],
    });

    await hook(event, api);

    expect(api.idToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "john",
    );
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "john",
    );
  });

  it("resolves username from linked identity's profileData.username", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent({
      identities: [
        {
          connection: "email",
          provider: "email",
          user_id: "123",
          isSocial: false,
        },
        {
          connection: "Username-Password-Authentication",
          provider: "auth2",
          user_id: "456",
          isSocial: false,
          profileData: {
            username: "john-from-profile",
          },
        },
      ],
    });

    await hook(event, api);

    expect(api.idToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "john-from-profile",
    );
  });

  it("uses the first linked identity with a username when multiple exist", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent({
      identities: [
        {
          connection: "email",
          provider: "email",
          user_id: "123",
          isSocial: false,
        },
        {
          connection: "Username-Password-Authentication",
          provider: "auth2",
          user_id: "456",
          isSocial: false,
          username: "first-username",
        },
        {
          connection: "Username-Password-Authentication",
          provider: "auth2",
          user_id: "789",
          isSocial: false,
          username: "second-username",
        },
      ],
    });

    await hook(event, api);

    expect(api.idToken.setCustomClaim).toHaveBeenCalledWith(
      "preferred_username",
      "first-username",
    );
  });

  it("does nothing when user has no username anywhere", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent({
      identities: [
        {
          connection: "email",
          provider: "email",
          user_id: "123",
          isSocial: false,
        },
      ],
    });

    await hook(event, api);

    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
  });

  it("does nothing when user is undefined", async () => {
    const hook = setPreferredUsername();
    const api = createMockApi();
    const event = createMockEvent(undefined);

    await hook(event, api);

    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
  });
});
