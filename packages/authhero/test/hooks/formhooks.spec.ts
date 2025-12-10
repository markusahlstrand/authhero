import { describe, it, expect } from "vitest";
import {
  evaluateRouter,
  resolveNextStepNode,
  buildRouterContext,
} from "../../src/hooks/formhooks";

describe("formhooks - router evaluation", () => {
  describe("evaluateRouter", () => {
    it("should return next_node when a rule matches with EQUALS", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [{ operator: "EQUALS", operands: ["status", "active"] }],
              },
              next_node: "step_match",
            },
          ],
          fallback: "step_fallback",
        },
      };

      const context = { status: "active" };
      const result = evaluateRouter(router, context);
      expect(result).toBe("step_match");
    });

    it("should return fallback when no rules match", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [{ operator: "EQUALS", operands: ["status", "active"] }],
              },
              next_node: "step_match",
            },
          ],
          fallback: "step_fallback",
        },
      };

      const context = { status: "inactive" };
      const result = evaluateRouter(router, context);
      expect(result).toBe("step_fallback");
    });

    it("should evaluate ENDS_WITH operator correctly", () => {
      const router = {
        id: "router_email",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              alias: "Sesamy email",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "ENDS_WITH", operands: ["email", "sesamy.com"] },
                ],
              },
              next_node: "step_sesamy",
            },
          ],
          fallback: "$ending",
        },
      };

      expect(evaluateRouter(router, { email: "test@sesamy.com" })).toBe("step_sesamy");
      expect(evaluateRouter(router, { email: "test@other.com" })).toBe("$ending");
      expect(evaluateRouter(router, { email: "test@sesamyxcom" })).toBe("$ending");
    });

    it("should evaluate STARTS_WITH operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "STARTS_WITH", operands: ["email", "admin"] },
                ],
              },
              next_node: "step_admin",
            },
          ],
          fallback: "step_user",
        },
      };

      expect(evaluateRouter(router, { email: "admin@example.com" })).toBe("step_admin");
      expect(evaluateRouter(router, { email: "user@example.com" })).toBe("step_user");
    });

    it("should evaluate CONTAINS operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "CONTAINS", operands: ["name", "admin"] },
                ],
              },
              next_node: "step_admin",
            },
          ],
          fallback: "step_user",
        },
      };

      expect(evaluateRouter(router, { name: "superadmin" })).toBe("step_admin");
      expect(evaluateRouter(router, { name: "admin123" })).toBe("step_admin");
      expect(evaluateRouter(router, { name: "user" })).toBe("step_user");
    });

    it("should evaluate NOT_CONTAINS operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "NOT_CONTAINS", operands: ["name", "test"] },
                ],
              },
              next_node: "step_prod",
            },
          ],
          fallback: "step_test",
        },
      };

      expect(evaluateRouter(router, { name: "production_user" })).toBe("step_prod");
      expect(evaluateRouter(router, { name: "test_user" })).toBe("step_test");
    });

    it("should evaluate NOT_EQUALS operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "NOT_EQUALS", operands: ["role", "guest"] },
                ],
              },
              next_node: "step_member",
            },
          ],
          fallback: "step_guest",
        },
      };

      expect(evaluateRouter(router, { role: "admin" })).toBe("step_member");
      expect(evaluateRouter(router, { role: "guest" })).toBe("step_guest");
    });

    it("should evaluate HAS_VALUE operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "HAS_VALUE", operands: ["impersonate_user_id"] },
                ],
              },
              next_node: "step_impersonate",
            },
          ],
          fallback: "step_normal",
        },
      };

      expect(evaluateRouter(router, { impersonate_user_id: "user123" })).toBe(
        "step_impersonate",
      );
      expect(evaluateRouter(router, { impersonate_user_id: "" })).toBe("step_normal");
      expect(evaluateRouter(router, { impersonate_user_id: null })).toBe("step_normal");
      expect(evaluateRouter(router, {})).toBe("step_normal");
    });

    it("should evaluate IS_EMPTY operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [{ operator: "IS_EMPTY", operands: ["nickname"] }],
              },
              next_node: "step_collect_nickname",
            },
          ],
          fallback: "step_continue",
        },
      };

      expect(evaluateRouter(router, {})).toBe("step_collect_nickname");
      expect(evaluateRouter(router, { nickname: "" })).toBe("step_collect_nickname");
      expect(evaluateRouter(router, { nickname: null })).toBe("step_collect_nickname");
      expect(evaluateRouter(router, { nickname: "John" })).toBe("step_continue");
    });

    it("should evaluate GREATER_THAN operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [{ operator: "GREATER_THAN", operands: ["age", 18] }],
              },
              next_node: "step_adult",
            },
          ],
          fallback: "step_minor",
        },
      };

      expect(evaluateRouter(router, { age: 21 })).toBe("step_adult");
      expect(evaluateRouter(router, { age: 18 })).toBe("step_minor");
      expect(evaluateRouter(router, { age: 15 })).toBe("step_minor");
    });

    it("should evaluate LESS_THAN operator correctly", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [{ operator: "LESS_THAN", operands: ["score", 50] }],
              },
              next_node: "step_fail",
            },
          ],
          fallback: "step_pass",
        },
      };

      expect(evaluateRouter(router, { score: 30 })).toBe("step_fail");
      expect(evaluateRouter(router, { score: 50 })).toBe("step_pass");
      expect(evaluateRouter(router, { score: 80 })).toBe("step_pass");
    });

    it("should evaluate AND conditions - all must match", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "EQUALS", operands: ["role", "admin"] },
                  { operator: "EQUALS", operands: ["active", true] },
                ],
              },
              next_node: "step_admin_active",
            },
          ],
          fallback: "step_other",
        },
      };

      expect(evaluateRouter(router, { role: "admin", active: true })).toBe(
        "step_admin_active",
      );
      expect(evaluateRouter(router, { role: "admin", active: false })).toBe(
        "step_other",
      );
      expect(evaluateRouter(router, { role: "user", active: true })).toBe("step_other");
    });

    it("should evaluate OR conditions - any can match", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "OR",
                operands: [
                  { operator: "EQUALS", operands: ["role", "admin"] },
                  { operator: "EQUALS", operands: ["role", "superuser"] },
                ],
              },
              next_node: "step_privileged",
            },
          ],
          fallback: "step_normal",
        },
      };

      expect(evaluateRouter(router, { role: "admin" })).toBe("step_privileged");
      expect(evaluateRouter(router, { role: "superuser" })).toBe("step_privileged");
      expect(evaluateRouter(router, { role: "user" })).toBe("step_normal");
    });

    it("should evaluate nested AND/OR conditions", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "EQUALS", operands: ["active", true] },
                  {
                    operator: "OR",
                    operands: [
                      { operator: "EQUALS", operands: ["role", "admin"] },
                      { operator: "EQUALS", operands: ["role", "moderator"] },
                    ],
                  },
                ],
              },
              next_node: "step_staff",
            },
          ],
          fallback: "step_user",
        },
      };

      expect(evaluateRouter(router, { active: true, role: "admin" })).toBe("step_staff");
      expect(evaluateRouter(router, { active: true, role: "moderator" })).toBe(
        "step_staff",
      );
      expect(evaluateRouter(router, { active: false, role: "admin" })).toBe("step_user");
      expect(evaluateRouter(router, { active: true, role: "user" })).toBe("step_user");
    });

    it("should evaluate rules in order and return first match", () => {
      const router = {
        id: "router_1",
        type: "ROUTER" as const,
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [{ operator: "EQUALS", operands: ["priority", "high"] }],
              },
              next_node: "step_high",
            },
            {
              id: "rule_2",
              condition: {
                operator: "AND",
                operands: [{ operator: "EQUALS", operands: ["priority", "medium"] }],
              },
              next_node: "step_medium",
            },
            {
              id: "rule_3",
              condition: {
                operator: "AND",
                operands: [{ operator: "HAS_VALUE", operands: ["priority"] }],
              },
              next_node: "step_any_priority",
            },
          ],
          fallback: "step_no_priority",
        },
      };

      expect(evaluateRouter(router, { priority: "high" })).toBe("step_high");
      expect(evaluateRouter(router, { priority: "medium" })).toBe("step_medium");
      expect(evaluateRouter(router, { priority: "low" })).toBe("step_any_priority");
      expect(evaluateRouter(router, {})).toBe("step_no_priority");
    });
  });

  describe("resolveNextStepNode", () => {
    const nodes = [
      {
        id: "step_1",
        type: "STEP",
        config: { components: [], next_node: "step_2" },
      },
      {
        id: "step_2",
        type: "STEP",
        config: { components: [], next_node: "$ending" },
      },
      {
        id: "router_1",
        type: "ROUTER",
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [
                  { operator: "ENDS_WITH", operands: ["email", "sesamy.com"] },
                ],
              },
              next_node: "step_1",
            },
          ],
          fallback: "step_2",
        },
      },
      {
        id: "router_2",
        type: "ROUTER",
        config: {
          rules: [
            {
              id: "rule_1",
              condition: {
                operator: "AND",
                operands: [{ operator: "HAS_VALUE", operands: ["admin"] }],
              },
              next_node: "router_1",
            },
          ],
          fallback: "$ending",
        },
      },
    ];

    it("should return the same ID if it's already a STEP node", () => {
      const result = resolveNextStepNode("step_1", nodes, {});
      expect(result).toBe("step_1");
    });

    it("should return $ending as-is", () => {
      const result = resolveNextStepNode("$ending", nodes, {});
      expect(result).toBe("$ending");
    });

    it("should return null for undefined nodeId", () => {
      const result = resolveNextStepNode(undefined, nodes, {});
      expect(result).toBeNull();
    });

    it("should return null for non-existent node", () => {
      const result = resolveNextStepNode("nonexistent", nodes, {});
      expect(result).toBeNull();
    });

    it("should resolve through a router to a STEP node", () => {
      const result = resolveNextStepNode("router_1", nodes, {
        email: "test@sesamy.com",
      });
      expect(result).toBe("step_1");
    });

    it("should use router fallback when no rules match", () => {
      const result = resolveNextStepNode("router_1", nodes, {
        email: "test@other.com",
      });
      expect(result).toBe("step_2");
    });

    it("should resolve through chained routers", () => {
      const result = resolveNextStepNode("router_2", nodes, {
        admin: true,
        email: "test@sesamy.com",
      });
      expect(result).toBe("step_1");
    });

    it("should return $ending when routers chain to ending", () => {
      const result = resolveNextStepNode("router_2", nodes, {});
      expect(result).toBe("$ending");
    });

    it("should handle max depth to prevent infinite loops", () => {
      const loopingNodes = [
        {
          id: "router_a",
          type: "ROUTER",
          config: {
            rules: [
              {
                id: "rule_1",
                condition: { operator: "AND", operands: [] },
                next_node: "router_b",
              },
            ],
            fallback: "router_b",
          },
        },
        {
          id: "router_b",
          type: "ROUTER",
          config: {
            rules: [
              {
                id: "rule_1",
                condition: { operator: "AND", operands: [] },
                next_node: "router_a",
              },
            ],
            fallback: "router_a",
          },
        },
      ];

      // Should return null due to max depth protection
      const result = resolveNextStepNode("router_a", loopingNodes, {}, 5);
      expect(result).toBeNull();
    });
  });

  describe("buildRouterContext", () => {
    it("should build context from user data", () => {
      const user = {
        id: "user_123",
        email: "test@example.com",
        email_verified: true,
        name: "Test User",
        nickname: "testy",
        picture: "https://example.com/pic.jpg",
        user_metadata: { theme: "dark" },
        app_metadata: { plan: "premium" },
      };

      const context = buildRouterContext(user);

      expect(context.user_id).toBe("user_123");
      expect(context.email).toBe("test@example.com");
      expect(context.email_verified).toBe(true);
      expect(context.name).toBe("Test User");
      expect(context.nickname).toBe("testy");
      expect(context.picture).toBe("https://example.com/pic.jpg");
      expect(context.theme).toBe("dark");
      expect(context.plan).toBe("premium");
    });

    it("should include authParams from loginSession", () => {
      const user = { id: "user_123", email: "test@example.com" };
      const loginSession = {
        authParams: {
          client_id: "client_123",
          redirect_uri: "https://app.example.com/callback",
          scope: "openid profile",
        },
      };

      const context = buildRouterContext(user, loginSession as any);

      expect(context.client_id).toBe("client_123");
      expect(context.redirect_uri).toBe("https://app.example.com/callback");
      expect(context.scope).toBe("openid profile");
    });

    it("should handle undefined user", () => {
      const context = buildRouterContext(undefined);

      expect(context.user_id).toBeUndefined();
      expect(context.email).toBeUndefined();
    });

    it("should handle undefined loginSession", () => {
      const user = { id: "user_123", email: "test@example.com" };
      const context = buildRouterContext(user, undefined);

      expect(context.user_id).toBe("user_123");
      expect(context.email).toBe("test@example.com");
    });

    it("should merge user_metadata and app_metadata", () => {
      const user = {
        id: "user_123",
        user_metadata: { favorite_color: "blue", language: "en" },
        app_metadata: { role: "admin", tenant: "acme" },
      };

      const context = buildRouterContext(user);

      expect(context.favorite_color).toBe("blue");
      expect(context.language).toBe("en");
      expect(context.role).toBe("admin");
      expect(context.tenant).toBe("acme");
    });
  });

  describe("real-world scenario: sesamy email router", () => {
    it("should route sesamy.com emails to the step and others to ending", () => {
      const nodes = [
        {
          id: "step_c5qf",
          type: "STEP",
          coordinates: { x: 529, y: 1 },
          alias: "Add nickname",
          config: {
            components: [
              { id: "component_q0wt", type: "RICH_TEXT", config: {} },
              { id: "next_button_nekx", type: "NEXT_BUTTON", config: {} },
            ],
            next_node: "$ending",
          },
        },
        {
          id: "router_w6f7",
          type: "ROUTER",
          coordinates: { x: 230, y: 192 },
          alias: "Sesamy email",
          config: {
            rules: [
              {
                id: "id_1765362841720",
                alias: "Rule 1",
                condition: {
                  operator: "AND",
                  operands: [
                    { operator: "ENDS_WITH", operands: ["email", "sesamy.com"] },
                  ],
                },
                next_node: "step_c5qf",
              },
            ],
            fallback: "$ending",
          },
        },
      ];

      // Sesamy user should see the step
      const sesamyResult = resolveNextStepNode("router_w6f7", nodes, {
        email: "markus@sesamy.com",
      });
      expect(sesamyResult).toBe("step_c5qf");

      // Other users should end immediately
      const otherResult = resolveNextStepNode("router_w6f7", nodes, {
        email: "user@gmail.com",
      });
      expect(otherResult).toBe("$ending");
    });
  });
});
