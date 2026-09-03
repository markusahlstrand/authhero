import { describe, it, expect } from "vitest";
import {
  buildScopeOptions,
  definedScopeValues,
  definedScopesByAudience,
  undefinedGrantScopes,
  type ResourceServerLike,
} from "./clientGrantScopes";

const server: ResourceServerLike = {
  identifier: "urn:sesamy",
  scopes: [
    { value: "users:read", description: "Read users" },
    { permission_name: "entitlements:read", description: "Read entitlements" },
    { value: "", description: "ignored" },
  ],
};

describe("definedScopeValues", () => {
  it("reads both value and permission_name and drops empties", () => {
    expect(definedScopeValues(server)).toEqual(
      new Set(["users:read", "entitlements:read"]),
    );
  });

  it("returns an empty set for a resource server without scopes", () => {
    expect(definedScopeValues(undefined)).toEqual(new Set());
    expect(definedScopeValues({ identifier: "urn:x" })).toEqual(new Set());
  });
});

describe("definedScopesByAudience", () => {
  it("keys the defined scopes by resource-server identifier", () => {
    const map = definedScopesByAudience([
      server,
      { identifier: "urn:other", scopes: [{ value: "a" }] },
    ]);

    expect(map.get("urn:sesamy")).toEqual(
      new Set(["users:read", "entitlements:read"]),
    );
    expect(map.get("urn:other")).toEqual(new Set(["a"]));
    expect(map.get("urn:missing")).toBeUndefined();
  });
});

describe("buildScopeOptions", () => {
  it("keeps the resource server's scopes with their descriptions", () => {
    expect(buildScopeOptions(server, [])).toEqual([
      {
        value: "users:read",
        description: "Read users",
        undefinedOnResourceServer: false,
      },
      {
        value: "entitlements:read",
        description: "Read entitlements",
        undefinedOnResourceServer: false,
      },
    ]);
  });

  it("appends granted scopes the resource server does not define, flagged", () => {
    const options = buildScopeOptions(server, [
      "users:read",
      "access-lists:write",
      "access-lists:manage",
    ]);

    expect(options.filter((o) => o.undefinedOnResourceServer)).toEqual([
      {
        value: "access-lists:write",
        description: "",
        undefinedOnResourceServer: true,
      },
      {
        value: "access-lists:manage",
        description: "",
        undefinedOnResourceServer: true,
      },
    ]);
  });

  it("does not duplicate a granted scope that is defined", () => {
    const options = buildScopeOptions(server, ["users:read", "users:read"]);
    expect(options.map((o) => o.value)).toEqual([
      "users:read",
      "entitlements:read",
    ]);
  });

  it("flags every granted scope when the audience has no resource server", () => {
    const options = buildScopeOptions(undefined, ["users:read"]);
    expect(options).toEqual([
      {
        value: "users:read",
        description: "",
        undefinedOnResourceServer: true,
      },
    ]);
  });
});

describe("undefinedGrantScopes", () => {
  it("returns the granted scopes missing from the resource server", () => {
    expect(
      undefinedGrantScopes(
        ["users:read", "access-lists:write"],
        definedScopeValues(server),
      ),
    ).toEqual(["access-lists:write"]);
  });

  it("flags nothing while the resource servers are still loading", () => {
    expect(undefinedGrantScopes(["users:read"], undefined)).toEqual([]);
  });
});
