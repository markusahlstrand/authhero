import { describe, it, expect } from "vitest";
import {
  baseUserSchema,
  userInsertSchema,
} from "@authhero/adapter-interfaces";

/**
 * INVARIANT: plain usernames must not contain "@".
 *
 * Both getUserByProvider (helpers/users.ts) and getConnectionFromIdentifier
 * (utils/username.ts) infer the identifier type from the presence of "@".
 * If a username were allowed to contain "@", it would be misclassified as
 * an email, breaking lookups and creating data inconsistencies.
 *
 * The restriction is enforced by baseUserSchema's .refine() on `username`.
 * These tests guard against accidental removal of that refinement.
 */
describe("username must not contain @", () => {
  it("baseUserSchema rejects username with @", () => {
    const result = baseUserSchema.safeParse({
      username: "user@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const usernameErrors = result.error.issues.filter(
        (i) => i.path.includes("username"),
      );
      expect(usernameErrors.length).toBeGreaterThan(0);
      expect(usernameErrors[0]!.message).toContain("@");
    }
  });

  it("baseUserSchema accepts username without @", () => {
    const result = baseUserSchema.safeParse({
      username: "plainuser",
    });
    expect(result.success).toBe(true);
  });

  it("userInsertSchema rejects username with @", () => {
    const result = userInsertSchema.safeParse({
      username: "bad@user",
      connection: "Username-Password-Authentication",
    });
    expect(result.success).toBe(false);
  });

  it("baseUserSchema allows omitted username", () => {
    const result = baseUserSchema.safeParse({
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });
});
