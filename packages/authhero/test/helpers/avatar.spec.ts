import { describe, it, expect } from "vitest";
import type { User } from "@authhero/adapter-interfaces";
import {
  getAvatarColor,
  getAvatarInitials,
  getDefaultUserPicture,
  withDefaultPicture,
  renderAvatarSvg,
} from "../../src/helpers/avatar";

const baseUser: User = {
  user_id: "email|123",
  email: "test@example.com",
  name: "Test User",
  provider: "email",
  connection: "email",
  is_social: false,
  tenant_id: "tenantId",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("avatar helper", () => {
  describe("getAvatarColor", () => {
    it("is deterministic for the same seed", () => {
      expect(getAvatarColor("test@example.com")).toBe(
        getAvatarColor("test@example.com"),
      );
    });

    it("always returns a 6-digit hex color from the palette", () => {
      for (const seed of ["", "a", "test@example.com", "email|123", "?"]) {
        expect(getAvatarColor(seed)).toMatch(/^[0-9A-F]{6}$/);
      }
    });
  });

  describe("getAvatarInitials", () => {
    it("uses first and last name parts", () => {
      expect(getAvatarInitials({ name: "Test User" })).toBe("TU");
    });

    it("uses two letters of a single-word name", () => {
      expect(getAvatarInitials({ name: "Madonna" })).toBe("MA");
    });

    it("falls back through given/family, nickname, email, username", () => {
      expect(
        getAvatarInitials({ given_name: "Jane", family_name: "Doe" }),
      ).toBe("JD");
      expect(getAvatarInitials({ nickname: "neo" })).toBe("NE");
      expect(getAvatarInitials({ email: "alice@example.com" })).toBe("AL");
      expect(getAvatarInitials({ username: "bob" })).toBe("BO");
    });

    it("returns ? when there is nothing to derive from", () => {
      expect(getAvatarInitials({})).toBe("?");
    });
  });

  describe("getDefaultUserPicture", () => {
    it("builds an /avatars URL with initials and color", () => {
      const url = getDefaultUserPicture("https://auth.example.com/", baseUser);
      expect(url).toMatch(
        /^https:\/\/auth\.example\.com\/avatars\/TU\.svg\?bg=[0-9A-F]{6}$/,
      );
    });

    it("normalizes a missing trailing slash on the issuer", () => {
      const url = getDefaultUserPicture("https://auth.example.com", baseUser);
      expect(url).toContain("https://auth.example.com/avatars/");
    });

    it("does not leak the email into the URL", () => {
      const url = getDefaultUserPicture("https://auth.example.com/", baseUser);
      expect(url).not.toContain("test@example.com");
    });
  });

  describe("withDefaultPicture", () => {
    it("keeps an existing picture untouched", () => {
      const user = { ...baseUser, picture: "https://cdn.example.com/me.png" };
      expect(withDefaultPicture(user, "https://auth.example.com/")).toBe(user);
    });

    it("fills in a generated picture when missing", () => {
      const result = withDefaultPicture(baseUser, "https://auth.example.com/");
      expect(result.picture).toContain("/avatars/TU.svg");
      // input is not mutated
      expect(baseUser.picture).toBeUndefined();
    });
  });

  describe("renderAvatarSvg", () => {
    it("renders an svg with the color and uppercased initials", () => {
      const svg = renderAvatarSvg("tu", "1F77B4");
      expect(svg).toContain("<svg");
      expect(svg).toContain('fill="#1F77B4"');
      expect(svg).toContain(">TU<");
    });

    it("rejects non-hex bg values with a neutral fallback color", () => {
      const svg = renderAvatarSvg("AB", "red'/><script>");
      expect(svg).toContain('fill="#7F7F7F"');
      expect(svg).not.toContain("<script>");
    });

    it("escapes the text content", () => {
      const svg = renderAvatarSvg("<>", "1F77B4");
      expect(svg).toContain("&lt;&gt;");
    });
  });
});
