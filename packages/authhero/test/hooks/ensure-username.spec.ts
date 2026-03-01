import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureUsername,
  slugify,
  extractCandidateUsernames,
} from "../../src/hooks/pre-defined/ensure-username";
import type { HookEvent, OnExecutePostLoginAPI } from "../../src/types/Hooks";
import { HTTPException } from "hono/http-exception";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("lowercases and replaces non-alphanum with hyphens", () => {
    expect(slugify("John Doe")).toBe("john-doe");
  });

  it("strips diacritics", () => {
    expect(slugify("José García")).toBe("jose-garcia");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("returns undefined for empty result", () => {
    expect(slugify("@@@")).toBeUndefined();
  });

  it("handles phone numbers", () => {
    expect(slugify("+1-555-123-4567")).toBe("1-555-123-4567");
  });

  it("handles email-like local parts", () => {
    expect(slugify("john.doe")).toBe("john-doe");
  });
});

// ---------------------------------------------------------------------------
// extractCandidateUsernames
// ---------------------------------------------------------------------------

describe("extractCandidateUsernames", () => {
  it("returns candidates from all fields in order", () => {
    const candidates = extractCandidateUsernames({
      nickname: "Johnny",
      name: "John Doe",
      email: "jdoe@example.com",
      phone_number: "+15551234567",
    });
    expect(candidates).toEqual([
      "johnny",
      "john-doe",
      "jdoe",
      "15551234567",
    ]);
  });

  it("deduplicates candidates", () => {
    const candidates = extractCandidateUsernames({
      nickname: "john",
      name: "John",
      email: "john@example.com",
    });
    expect(candidates).toEqual(["john"]);
  });

  it("returns empty array when no fields are set", () => {
    expect(extractCandidateUsernames({})).toEqual([]);
  });

  it("skips fields that slugify to empty", () => {
    const candidates = extractCandidateUsernames({
      nickname: "@@@",
      email: "valid@example.com",
    });
    expect(candidates).toEqual(["valid"]);
  });
});

// ---------------------------------------------------------------------------
// ensureUsername hook
// ---------------------------------------------------------------------------

function createMockUserAdapter(existingUsers: Array<{ username?: string; provider: string; linked_to?: string }> = []) {
  return {
    list: vi.fn().mockImplementation(
      async (_tenantId: string, params?: { q?: string }) => {
        const q = params?.q || "";
        const matching = existingUsers.filter((u) => {
          const usernameMatch = q.match(/username:(\S+)/);
          const providerMatch = q.match(/provider:(\S+)/);
          const linkedToMatch = q.match(/linked_to:(\S+)/);
          return (
            (!usernameMatch || u.username === usernameMatch[1]) &&
            (!providerMatch || u.provider === providerMatch[1]) &&
            (!linkedToMatch || u.linked_to === linkedToMatch[1])
          );
        });
        return { users: matching };
      },
    ),
    create: vi.fn().mockImplementation(
      async (_tenantId: string, data: any) => ({
        ...data,
        user_id: data.user_id || `${USERNAME_PASSWORD_PROVIDER}|generated`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        login_count: 0,
      }),
    ),
    update: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
  };
}

function createMockEvent(
  user: Partial<HookEvent["user"]> & { user_id: string; provider: string },
  userAdapter: ReturnType<typeof createMockUserAdapter>,
  tenantId = "test-tenant",
): { event: HookEvent; api: OnExecutePostLoginAPI } {
  const event = {
    ctx: {
      env: {
        data: {
          users: userAdapter,
        },
      },
      var: { tenant_id: tenantId },
      req: { header: vi.fn().mockReturnValue(tenantId) },
    },
    user: {
      login_count: 0,
      is_social: false,
      connection: "Username-Password-Authentication",
      email_verified: false,
      ...user,
    },
    tenant: { id: tenantId },
  } as unknown as HookEvent;

  const api = {
    prompt: { render: vi.fn() },
    redirect: {
      sendUserTo: vi.fn(),
      encodeToken: vi.fn().mockReturnValue("token"),
      validateToken: vi.fn().mockReturnValue(null),
    },
    token: {
      createServiceToken: vi.fn().mockResolvedValue("service-token"),
    },
  } as unknown as OnExecutePostLoginAPI;

  return { event, api };
}

describe("ensureUsername", () => {
  let hook: ReturnType<typeof ensureUsername>;

  beforeEach(() => {
    hook = ensureUsername();
  });

  it("does nothing when user already has a username (username provider)", async () => {
    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: `${USERNAME_PASSWORD_PROVIDER}|123`,
        provider: USERNAME_PASSWORD_PROVIDER,
        username: "existing-user",
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.update).not.toHaveBeenCalled();
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("does nothing when user has a linked username identity", async () => {
    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "john@example.com",
        identities: [
          {
            provider: USERNAME_PASSWORD_PROVIDER,
            connection: "Username-Password-Authentication",
            user_id: `${USERNAME_PASSWORD_PROVIDER}|456`,
            isSocial: false,
            profileData: { username: "john" },
          },
        ],
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.update).not.toHaveBeenCalled();
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("updates username on username-password user when username field is empty", async () => {
    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: `${USERNAME_PASSWORD_PROVIDER}|123`,
        provider: USERNAME_PASSWORD_PROVIDER,
        name: "John Doe",
        username: undefined,
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.update).toHaveBeenCalledWith("test-tenant", `${USERNAME_PASSWORD_PROVIDER}|123`, {
      username: "john-doe",
    });
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("creates a linked username account for email users", async () => {
    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "jane@example.com",
        connection: "email",
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "jane",
        provider: USERNAME_PASSWORD_PROVIDER,
        connection: "Username-Password-Authentication",
        linked_to: "email|123",
      }),
    );
  });

  it("creates a linked username account for social users", async () => {
    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: "google-oauth2|456",
        provider: "google-oauth2",
        email: "mike@gmail.com",
        nickname: "mike",
        is_social: true,
        connection: "google-oauth2",
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "mike",
        linked_to: "google-oauth2|456",
      }),
    );
  });

  it("appends number when username is taken", async () => {
    const adapter = createMockUserAdapter([
      { username: "john", provider: USERNAME_PASSWORD_PROVIDER },
    ]);
    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "john@example.com",
        connection: "email",
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "john2",
        linked_to: "email|123",
      }),
    );
  });

  it("tries multiple numeric suffixes", async () => {
    const adapter = createMockUserAdapter([
      { username: "john", provider: USERNAME_PASSWORD_PROVIDER },
      { username: "john2", provider: USERNAME_PASSWORD_PROVIDER },
      { username: "john3", provider: USERNAME_PASSWORD_PROVIDER },
    ]);
    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "john@example.com",
        connection: "email",
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "john4",
      }),
    );
  });

  it("falls back to next candidate if first is exhausted", async () => {
    // Create adapter where "john" through "john11" are all taken (maxRetries=10)
    const taken = [{ username: "john", provider: USERNAME_PASSWORD_PROVIDER }];
    for (let i = 2; i <= 11; i++) {
      taken.push({ username: `john${i}`, provider: USERNAME_PASSWORD_PROVIDER });
    }
    const adapter = createMockUserAdapter(taken);

    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        nickname: "John",
        email: "john@example.com",
        name: "John Smith",
        connection: "email",
      },
      adapter,
    );

    await hook(event, api);

    // "john" candidates are exhausted, falls back to "john-smith" from name
    expect(adapter.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "john-smith",
      }),
    );
  });

  it("uses phone number as candidate", async () => {
    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: "sms|123",
        provider: "sms",
        phone_number: "+15551234567",
        connection: "sms",
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "15551234567",
        linked_to: "sms|123",
      }),
    );
  });

  it("does nothing when no candidates can be extracted", async () => {
    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        connection: "email",
        // no nickname, name, email, or phone_number
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.update).not.toHaveBeenCalled();
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("does nothing when user is missing", async () => {
    const adapter = createMockUserAdapter();
    const event = {
      ctx: {
        env: { data: { users: adapter } },
        var: { tenant_id: "test" },
        req: { header: vi.fn() },
      },
      user: undefined,
      tenant: { id: "test" },
    } as unknown as HookEvent;

    const api = {
      prompt: { render: vi.fn() },
      redirect: { sendUserTo: vi.fn(), encodeToken: vi.fn(), validateToken: vi.fn() },
      token: { createServiceToken: vi.fn() },
    } as unknown as OnExecutePostLoginAPI;

    await hook(event, api);

    expect(adapter.update).not.toHaveBeenCalled();
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("respects custom connection and provider options", async () => {
    const customHook = ensureUsername({
      connection: "my-username-db",
      provider: "custom-provider",
    });

    const adapter = createMockUserAdapter();
    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "test@example.com",
        connection: "email",
      },
      adapter,
    );

    await customHook(event, api);

    expect(adapter.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "test",
        provider: "custom-provider",
        connection: "my-username-db",
      }),
    );
  });

  it("retries on unique constraint conflict (409) when creating", async () => {
    // First call to create fails with 409 (concurrent claim),
    // second call succeeds.
    const adapter = createMockUserAdapter();
    adapter.create
      .mockRejectedValueOnce(new HTTPException(409, { message: "User already exists" }))
      .mockImplementation(async (_tenantId: string, data: any) => ({
        ...data,
        user_id: data.user_id || `${USERNAME_PASSWORD_PROVIDER}|generated`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        login_count: 0,
      }));

    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "jane@example.com",
        connection: "email",
      },
      adapter,
    );

    await hook(event, api);

    // create was called twice: first attempt (409), second attempt (success)
    expect(adapter.create).toHaveBeenCalledTimes(2);
    expect(adapter.create).toHaveBeenLastCalledWith(
      "test-tenant",
      expect.objectContaining({
        username: "jane",
        linked_to: "email|123",
      }),
    );
  });

  it("retries on unique constraint conflict (409) when updating", async () => {
    const adapter = createMockUserAdapter();
    adapter.update
      .mockRejectedValueOnce(new HTTPException(409, { message: "User already exists" }))
      .mockResolvedValue(true);

    const { event, api } = createMockEvent(
      {
        user_id: `${USERNAME_PASSWORD_PROVIDER}|123`,
        provider: USERNAME_PASSWORD_PROVIDER,
        name: "John Doe",
        username: undefined,
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.update).toHaveBeenCalledTimes(2);
  });

  it("does nothing when a linked user in the DB already has a username", async () => {
    // A linked username account exists in the database, but is NOT present
    // in the primary user's identities array. The hook should still detect it
    // via a DB query and skip creating a duplicate.
    const adapter = createMockUserAdapter([
      { username: "john", provider: "auth2", linked_to: "email|123" },
    ]);
    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "john@example.com",
        connection: "email",
        // Note: no identities array referencing the username account
      },
      adapter,
    );

    await hook(event, api);

    // Should NOT create another username account
    expect(adapter.create).not.toHaveBeenCalled();
    expect(adapter.update).not.toHaveBeenCalled();
  });

  it("does nothing when any linked user (different provider) has a username account", async () => {
    // Primary user logged in via google, but a linked username account already exists
    const adapter = createMockUserAdapter([
      { username: "mike", provider: "auth2", linked_to: "google-oauth2|789" },
    ]);
    const { event, api } = createMockEvent(
      {
        user_id: "google-oauth2|789",
        provider: "google-oauth2",
        email: "mike@gmail.com",
        nickname: "mike",
        is_social: true,
        connection: "google-oauth2",
      },
      adapter,
    );

    await hook(event, api);

    expect(adapter.create).not.toHaveBeenCalled();
    expect(adapter.update).not.toHaveBeenCalled();
  });

  it("propagates non-409 errors without retrying", async () => {
    const adapter = createMockUserAdapter();
    adapter.create.mockRejectedValue(
      new HTTPException(500, { message: "Internal error" }),
    );

    const { event, api } = createMockEvent(
      {
        user_id: "email|123",
        provider: "email",
        email: "jane@example.com",
        connection: "email",
      },
      adapter,
    );

    await expect(hook(event, api)).rejects.toThrow(HTTPException);
    expect(adapter.create).toHaveBeenCalledTimes(1);
  });
});
