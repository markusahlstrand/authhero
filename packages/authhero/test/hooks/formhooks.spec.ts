import { describe, it, expect, vi } from "vitest";
import {
  handleFormHook,
  isFormHook,
  resolveNode,
  buildUserUpdates,
  mergeUserUpdates,
} from "../../src/hooks/formhooks";
import { Context } from "hono";
import { Bindings, Variables } from "../../src/types";
import {
  LoginSession,
  LoginSessionState,
  Node,
  User,
} from "@authhero/adapter-interfaces";

describe("formhooks", () => {
  describe("isFormHook", () => {
    it("should return true for valid form hooks", () => {
      expect(isFormHook({ form_id: "form1", enabled: true })).toBe(true);
      expect(isFormHook({ form_id: "form2", enabled: false })).toBe(true);
    });

    it("should return false for invalid hooks", () => {
      expect(isFormHook({ enabled: true })).toBe(false);
      expect(isFormHook({ form_id: 123, enabled: true })).toBe(false);
      expect(isFormHook({})).toBe(false);
    });
  });

  describe("resolveNode", () => {
    const mockUser: User = {
      user_id: "user1",
      email: "test@example.com",
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      connection: "email",
      is_social: false,
      login_count: 1,
      provider: "email",
    };

    it("should return step type for STEP nodes", async () => {
      const nodes = [
        { id: "step1", type: "STEP", coordinates: { x: 0, y: 0 } },
      ] as Node[];
      const result = await resolveNode(nodes, "step1", { user: mockUser });
      expect(result).toEqual({ type: "step", nodeId: "step1" });
    });

    it("should return end type for $ending", async () => {
      const result = await resolveNode([], "$ending", { user: mockUser });
      expect(result).toEqual({ type: "end" });
    });

    it("should return null for missing nodes", async () => {
      const result = await resolveNode([], "nonexistent", { user: mockUser });
      expect(result).toBeNull();
    });
  });

  describe("handleFormHook", () => {
    const mockTenantId = "test-tenant";
    const mockUser: User = {
      user_id: "user1",
      email: "test@example.com",
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      connection: "email",
      is_social: false,
      login_count: 1,
      provider: "email",
    };

    const mockLoginSession: LoginSession = {
      id: "session1",
      state: LoginSessionState.PENDING,
      csrf_token: "csrf-token",
      authParams: {
        client_id: "client1",
        redirect_uri: "https://example.com/callback",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    function createMockContext(formResponse: any) {
      return {
        var: {
          tenant_id: mockTenantId,
        },
        req: {
          header: vi.fn().mockReturnValue(mockTenantId),
        },
        env: {
          data: {
            forms: {
              get: vi.fn().mockResolvedValue(formResponse),
            },
            flows: {
              get: vi.fn().mockResolvedValue(null),
            },
            loginSessions: {
              get: vi.fn().mockResolvedValue({
                ...mockLoginSession,
                state: "pending",
              }),
              update: vi.fn().mockResolvedValue(undefined),
            },
          },
        },
      } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;
    }

    it("should return user when form resolves to end (no step to display)", async () => {
      // Create a form with a ROUTER that goes to $ending
      const form = {
        id: "form1",
        start: { next_node: "router1" },
        nodes: [
          {
            id: "router1",
            type: "ROUTER",
            config: {
              rules: [
                {
                  condition: { operator: "equals", field: "", value: "" },
                  next_node: "$ending",
                },
              ],
              fallback: "$ending",
            },
          },
        ],
      };

      const ctx = createMockContext(form);
      const result = await handleFormHook(
        ctx,
        "form1",
        mockLoginSession,
        mockUser,
      );

      // Should return user (not a Response redirect) when form resolves to end
      expect(result).toBe(mockUser);
    });

    it("should return user when form has no matching step node", async () => {
      // Create a form with nodes that don't lead to any STEP
      const form = {
        id: "form1",
        start: { next_node: "nonexistent" },
        nodes: [], // No nodes at all
      };

      const ctx = createMockContext(form);
      const result = await handleFormHook(
        ctx,
        "form1",
        mockLoginSession,
        mockUser,
      );

      // Should return user when resolution returns null
      expect(result).toBe(mockUser);
    });

    it("should return redirect Response when form has a STEP node to display", async () => {
      const form = {
        id: "form1",
        start: { next_node: "step1" },
        nodes: [{ id: "step1", type: "STEP" }],
      };

      const ctx = createMockContext(form);
      const result = await handleFormHook(
        ctx,
        "form1",
        mockLoginSession,
        mockUser,
      );

      // Should return a Response redirect to the form step
      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        `/u/forms/form1/nodes/step1`,
      );
    });

    it("should throw when form is not found", async () => {
      const ctx = createMockContext(null);

      await expect(
        handleFormHook(ctx, "nonexistent", mockLoginSession, mockUser),
      ).rejects.toThrow("Form not found");
    });
  });

  describe("mergeUserUpdates", () => {
    it("should return empty array for empty input", () => {
      expect(mergeUserUpdates([])).toEqual([]);
    });

    it("should pass through a single update unchanged", () => {
      const updates = [
        { user_id: "u1", changes: { "metadata.foo": "bar" } },
      ];
      expect(mergeUserUpdates(updates)).toEqual([
        { user_id: "u1", connection_id: undefined, changes: { "metadata.foo": "bar" } },
      ]);
    });

    it("should merge overlapping metadata keys for the same user_id", () => {
      const updates = [
        { user_id: "u1", changes: { "metadata.foo": "bar" } },
        { user_id: "u1", changes: { "metadata.baz": "qux" } },
      ];
      const result = mergeUserUpdates(updates);
      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe("u1");
      expect(result[0].changes).toEqual({
        "metadata.foo": "bar",
        "metadata.baz": "qux",
      });
    });

    it("should let later values win for the same key", () => {
      const updates = [
        { user_id: "u1", changes: { "metadata.foo": "first" } },
        { user_id: "u1", changes: { "metadata.foo": "second" } },
      ];
      const result = mergeUserUpdates(updates);
      expect(result).toHaveLength(1);
      expect(result[0].changes["metadata.foo"]).toBe("second");
    });

    it("should keep different user_ids separate", () => {
      const updates = [
        { user_id: "u1", changes: { "metadata.a": "1" } },
        { user_id: "u2", changes: { "metadata.b": "2" } },
      ];
      const result = mergeUserUpdates(updates);
      expect(result).toHaveLength(2);
      expect(result[0].user_id).toBe("u1");
      expect(result[1].user_id).toBe("u2");
    });

    it("should merge address and top-level keys correctly", () => {
      const updates = [
        { user_id: "u1", changes: { "address.city": "NYC", name: "Alice" } },
        { user_id: "u1", changes: { "address.zip": "10001" } },
      ];
      const result = mergeUserUpdates(updates);
      expect(result).toHaveLength(1);
      expect(result[0].changes).toEqual({
        "address.city": "NYC",
        "address.zip": "10001",
        name: "Alice",
      });
    });
  });

  describe("buildUserUpdates with merged input", () => {
    it("should produce correct user_metadata from merged changes", () => {
      const merged = mergeUserUpdates([
        { user_id: "u1", changes: { "metadata.foo": "bar" } },
        { user_id: "u1", changes: { "metadata.baz": "qux" } },
      ]);
      const user = { user_metadata: { existing: "val" } };
      const result = buildUserUpdates(merged[0].changes, user);
      expect(result.user_metadata).toEqual({
        existing: "val",
        foo: "bar",
        baz: "qux",
      });
    });

    it("should handle user_metadata. prefix the same as metadata.", () => {
      const changes = {
        "user_metadata.birthdate": "1990-01-01",
        "user_metadata.country": "swe",
        "user_metadata.gender": "male",
      };
      const user = { user_metadata: { existing: "val" } };
      const result = buildUserUpdates(changes, user);
      expect(result.user_metadata).toEqual({
        existing: "val",
        birthdate: "1990-01-01",
        country: "swe",
        gender: "male",
      });
      // Should NOT have top-level keys like "user_metadata.birthdate"
      expect(Object.keys(result)).not.toContain("user_metadata.birthdate");
    });

    it("should mix metadata. and user_metadata. prefixes", () => {
      const changes = {
        "metadata.foo": "bar",
        "user_metadata.baz": "qux",
      };
      const user = { user_metadata: {} };
      const result = buildUserUpdates(changes, user);
      expect(result.user_metadata).toEqual({
        foo: "bar",
        baz: "qux",
      });
    });
  });
});
