import { describe, it, expect } from "vitest";
import {
  RefreshTokenLifetimeClient,
  lifetimeToExpiresAt,
  resolveAbsoluteRefreshTokenLifetime,
  resolveExchangeExpiryUpdate,
  resolveIdleRefreshTokenLifetime,
  resolveRefreshTokenExpiry,
  slideIdleExpiry,
} from "../../src/helpers/refresh-token-lifetime";

const HOUR = 60 * 60;

function makeClient(
  refresh_token?: RefreshTokenLifetimeClient["refresh_token"],
  tenant: RefreshTokenLifetimeClient["tenant"] = {},
): RefreshTokenLifetimeClient {
  return { refresh_token, tenant };
}

describe("refresh token lifetime resolution", () => {
  describe("absolute lifetime", () => {
    it("falls back to the tenant session_lifetime when the client says nothing", () => {
      const client = makeClient(undefined, { session_lifetime: 48 });
      expect(resolveAbsoluteRefreshTokenLifetime(client)).toEqual({
        kind: "seconds",
        seconds: 48 * HOUR,
      });
    });

    it("prefers the client's token_lifetime over the tenant setting", () => {
      const client = makeClient(
        { token_lifetime: 7200 },
        { session_lifetime: 48 },
      );
      expect(resolveAbsoluteRefreshTokenLifetime(client)).toEqual({
        kind: "seconds",
        seconds: 7200,
      });
    });

    it("honours infinite_token_lifetime over both", () => {
      const client = makeClient(
        { infinite_token_lifetime: true, token_lifetime: 7200 },
        { session_lifetime: 48 },
      );
      expect(resolveAbsoluteRefreshTokenLifetime(client)).toEqual({
        kind: "infinite",
      });
    });

    it("honours expiration_type: non-expiring", () => {
      const client = makeClient(
        { expiration_type: "non-expiring", token_lifetime: 7200 },
        { session_lifetime: 48 },
      );
      expect(resolveAbsoluteRefreshTokenLifetime(client)).toEqual({
        kind: "infinite",
      });
    });

    it("reports unset when neither level configures anything", () => {
      expect(resolveAbsoluteRefreshTokenLifetime(makeClient())).toEqual({
        kind: "unset",
      });
    });
  });

  describe("idle lifetime", () => {
    it("falls back to the tenant idle_session_lifetime", () => {
      const client = makeClient(undefined, { idle_session_lifetime: 12 });
      expect(resolveIdleRefreshTokenLifetime(client)).toEqual({
        kind: "seconds",
        seconds: 12 * HOUR,
      });
    });

    it("prefers the client's idle_token_lifetime", () => {
      const client = makeClient(
        { idle_token_lifetime: 900 },
        { idle_session_lifetime: 12 },
      );
      expect(resolveIdleRefreshTokenLifetime(client)).toEqual({
        kind: "seconds",
        seconds: 900,
      });
    });

    it("honours infinite_idle_token_lifetime and non-expiring", () => {
      expect(
        resolveIdleRefreshTokenLifetime(
          makeClient(
            { infinite_idle_token_lifetime: true },
            { idle_session_lifetime: 12 },
          ),
        ),
      ).toEqual({ kind: "infinite" });
      expect(
        resolveIdleRefreshTokenLifetime(
          makeClient(
            { expiration_type: "non-expiring" },
            { idle_session_lifetime: 12 },
          ),
        ),
      ).toEqual({ kind: "infinite" });
    });

    it("does not let an absolute-only client config affect the idle window", () => {
      const client = makeClient(
        { token_lifetime: 7200 },
        { idle_session_lifetime: 12 },
      );
      expect(resolveIdleRefreshTokenLifetime(client)).toEqual({
        kind: "seconds",
        seconds: 12 * HOUR,
      });
    });
  });

  describe("resolveRefreshTokenExpiry", () => {
    const now = Date.UTC(2026, 0, 1);

    it("stamps both expiries from the client config", () => {
      const expiry = resolveRefreshTokenExpiry(
        makeClient(
          { token_lifetime: 7200, idle_token_lifetime: 900 },
          { session_lifetime: 48, idle_session_lifetime: 12 },
        ),
        now,
      );
      expect(expiry.expires_at).toBe(new Date(now + 7200 * 1000).toISOString());
      expect(expiry.idle_expires_at).toBe(
        new Date(now + 900 * 1000).toISOString(),
      );
    });

    it("omits both for a non-expiring client", () => {
      const expiry = resolveRefreshTokenExpiry(
        makeClient(
          { expiration_type: "non-expiring" },
          { session_lifetime: 48, idle_session_lifetime: 12 },
        ),
        now,
      );
      expect(expiry.expires_at).toBeUndefined();
      expect(expiry.idle_expires_at).toBeUndefined();
    });

    it("keeps the tenant-derived behaviour when the client is unconfigured", () => {
      const expiry = resolveRefreshTokenExpiry(
        makeClient(undefined, {
          session_lifetime: 48,
          idle_session_lifetime: 12,
        }),
        now,
      );
      expect(expiry.expires_at).toBe(
        new Date(now + 48 * HOUR * 1000).toISOString(),
      );
      expect(expiry.idle_expires_at).toBe(
        new Date(now + 12 * HOUR * 1000).toISOString(),
      );
    });
  });

  describe("slideIdleExpiry", () => {
    const now = Date.UTC(2026, 0, 1);
    const current = new Date(now - 1000).toISOString();

    it("slides an existing window by the client's idle lifetime", () => {
      expect(
        slideIdleExpiry(makeClient({ idle_token_lifetime: 900 }), current, now),
      ).toBe(new Date(now + 900 * 1000).toISOString());
    });

    it("clears the window when the client is configured never to expire", () => {
      expect(
        slideIdleExpiry(
          makeClient({ infinite_idle_token_lifetime: true }),
          current,
          now,
        ),
      ).toBeUndefined();
    });

    it("leaves the window untouched when nothing is configured", () => {
      expect(slideIdleExpiry(makeClient(), current, now)).toBe(current);
    });

    it("does not retro-fit an idle window onto a row that has none", () => {
      expect(
        slideIdleExpiry(
          makeClient({ idle_token_lifetime: 900 }),
          undefined,
          now,
        ),
      ).toBeUndefined();
    });
  });

  describe("resolveExchangeExpiryUpdate", () => {
    const now = Date.UTC(2026, 0, 1);
    const current = {
      expires_at: new Date(now + 30 * 24 * HOUR * 1000).toISOString(),
      idle_expires_at: new Date(now + 60 * 1000).toISOString(),
    };

    it("slides the idle window and leaves the absolute expiry alone", () => {
      expect(
        resolveExchangeExpiryUpdate(
          makeClient({ idle_token_lifetime: 900 }),
          current,
          now,
        ),
      ).toEqual({
        idle_expires_at: new Date(now + 900 * 1000).toISOString(),
      });
    });

    it("clears both windows when the client is explicitly non-expiring", () => {
      expect(
        resolveExchangeExpiryUpdate(
          makeClient({ expiration_type: "non-expiring" }),
          current,
          now,
        ),
      ).toEqual({ expires_at: null, idle_expires_at: null });
    });

    it("clears only the absolute window for infinite_token_lifetime", () => {
      expect(
        resolveExchangeExpiryUpdate(
          makeClient({
            infinite_token_lifetime: true,
            idle_token_lifetime: 900,
          }),
          current,
          now,
        ),
      ).toEqual({
        expires_at: null,
        idle_expires_at: new Date(now + 900 * 1000).toISOString(),
      });
    });

    it("clears only the idle window for infinite_idle_token_lifetime", () => {
      expect(
        resolveExchangeExpiryUpdate(
          makeClient({ infinite_idle_token_lifetime: true }),
          current,
          now,
        ),
      ).toEqual({ idle_expires_at: null });
    });

    it("never extends the absolute window, however it is configured", () => {
      expect(
        resolveExchangeExpiryUpdate(
          makeClient({ token_lifetime: 10 * 365 * 24 * HOUR }),
          current,
          now,
        ).expires_at,
      ).toBeUndefined();
    });

    it("writes nothing when neither level configures a lifetime", () => {
      expect(resolveExchangeExpiryUpdate(makeClient(), current, now)).toEqual(
        {},
      );
    });

    it("does not retro-fit expiries onto a row that carries none", () => {
      expect(
        resolveExchangeExpiryUpdate(
          makeClient({
            expiration_type: "non-expiring",
            idle_token_lifetime: 900,
          }),
          {},
          now,
        ),
      ).toEqual({});
    });
  });

  it("treats a zero lifetime as unset rather than an instant expiry", () => {
    expect(
      resolveAbsoluteRefreshTokenLifetime(makeClient({ token_lifetime: 0 })),
    ).toEqual({ kind: "unset" });
    expect(
      resolveIdleRefreshTokenLifetime(makeClient({ idle_token_lifetime: 0 })),
    ).toEqual({ kind: "unset" });
  });

  it("maps infinite and unset lifetimes to no timestamp", () => {
    expect(lifetimeToExpiresAt({ kind: "infinite" })).toBeUndefined();
    expect(lifetimeToExpiresAt({ kind: "unset" })).toBeUndefined();
  });
});
