/**
 * Workflow Engine Tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  WorkflowEngine,
  type WorkflowDefinition,
  type WorkflowStorage,
  type WorkflowState,
  type StepContext,
} from "../../src/workflow";

// Mock storage implementation
function createMockStorage(): WorkflowStorage & {
  states: Map<string, WorkflowState>;
} {
  const states = new Map<string, WorkflowState>();
  return {
    states,
    async save(state: WorkflowState) {
      states.set(state.id, { ...state });
    },
    async load(id: string) {
      return states.get(id) ?? null;
    },
    async delete(id: string) {
      states.delete(id);
    },
  };
}

describe("WorkflowEngine", () => {
  it("should start a workflow and suspend on first screen", async () => {
    const storage = createMockStorage();
    const engine = new WorkflowEngine({ storage });

    const testWorkflow: WorkflowDefinition = {
      id: "test-flow",
      name: "Test Flow",
      startStep: "step1",
      steps: new Map([
        [
          "step1",
          {
            id: "step1",
            type: "screen",
            getScreen: () => ({
              action: "/submit",
              method: "POST",
              title: "Step 1",
              components: [],
            }),
          },
        ],
      ]),
    };

    engine.register(testWorkflow);

    const result = await engine.start("test-flow", {
      data: {},
      request: { url: "http://test", method: "GET", headers: {} },
      tenant: { id: "test-tenant" },
    });

    expect(result.type).toBe("screen");
    if (result.type === "screen") {
      expect(result.screen.title).toBe("Step 1");
      expect(result.state.step).toBe("step1");
      expect(result.state.suspended?.type).toBe("screen");
    }

    // State should be persisted
    expect(storage.states.size).toBe(1);
  });

  it("should resume and advance to next step", async () => {
    const storage = createMockStorage();
    const engine = new WorkflowEngine({ storage });

    const executeHandler = vi.fn(async (_ctx: StepContext) => ({
      type: "next" as const,
      step: "step2",
      context: { formData: { username: "test@example.com" } },
    }));

    const testWorkflow: WorkflowDefinition = {
      id: "test-flow",
      name: "Test Flow",
      startStep: "step1",
      steps: new Map([
        [
          "step1",
          {
            id: "step1",
            type: "screen",
            getScreen: () => ({
              action: "/submit",
              method: "POST",
              title: "Step 1",
              components: [],
            }),
            execute: executeHandler,
          },
        ],
        [
          "step2",
          {
            id: "step2",
            type: "screen",
            getScreen: () => ({
              action: "/submit",
              method: "POST",
              title: "Step 2",
              components: [],
            }),
          },
        ],
      ]),
    };

    engine.register(testWorkflow);

    // Start the workflow
    const startResult = await engine.start("test-flow", {
      data: {},
      request: { url: "http://test", method: "GET", headers: {} },
      tenant: { id: "test-tenant" },
    });

    expect(startResult.type).toBe("screen");
    const stateId = (startResult as any).state.id;

    // Resume with form input
    const resumeResult = await engine.resume(
      stateId,
      {
        data: {},
        request: { url: "http://test", method: "POST", headers: {} },
        tenant: { id: "test-tenant" },
      },
      { username: "test@example.com" },
    );

    expect(resumeResult.type).toBe("screen");
    if (resumeResult.type === "screen") {
      expect(resumeResult.screen.title).toBe("Step 2");
      expect(resumeResult.state.step).toBe("step2");
      expect(resumeResult.state.context.formData).toEqual({
        username: "test@example.com",
      });
    }
  });

  it("should handle workflow completion", async () => {
    const storage = createMockStorage();
    const engine = new WorkflowEngine({ storage });
    const onComplete = vi.fn();

    const testWorkflow: WorkflowDefinition = {
      id: "test-flow",
      name: "Test Flow",
      startStep: "step1",
      steps: new Map([
        [
          "step1",
          {
            id: "step1",
            type: "action",
            execute: async () => ({
              type: "complete" as const,
              result: { success: true },
            }),
          },
        ],
      ]),
      hooks: {
        onComplete,
      },
    };

    engine.register(testWorkflow);

    const result = await engine.start("test-flow", {
      data: {},
      request: { url: "http://test", method: "GET", headers: {} },
      tenant: { id: "test-tenant" },
    });

    expect(result.type).toBe("complete");
    if (result.type === "complete") {
      expect(result.result).toEqual({ success: true });
    }
    expect(onComplete).toHaveBeenCalled();

    // State should be cleaned up
    expect(storage.states.size).toBe(0);
  });

  it("should handle condition steps", async () => {
    const storage = createMockStorage();
    const engine = new WorkflowEngine({ storage });

    const testWorkflow: WorkflowDefinition = {
      id: "test-flow",
      name: "Test Flow",
      startStep: "check",
      defaultContext: { usePassword: true },
      steps: new Map([
        [
          "check",
          {
            id: "check",
            type: "condition",
            execute: async (ctx: StepContext) => ({
              type: "next" as const,
              step: ctx.state.context.usePassword
                ? "password-screen"
                : "code-screen",
            }),
          },
        ],
        [
          "password-screen",
          {
            id: "password-screen",
            type: "screen",
            getScreen: () => ({
              action: "/submit",
              method: "POST",
              title: "Enter Password",
              components: [],
            }),
          },
        ],
        [
          "code-screen",
          {
            id: "code-screen",
            type: "screen",
            getScreen: () => ({
              action: "/submit",
              method: "POST",
              title: "Enter Code",
              components: [],
            }),
          },
        ],
      ]),
    };

    engine.register(testWorkflow);

    // Test with usePassword: true
    const result1 = await engine.start("test-flow", {
      data: {},
      request: { url: "http://test", method: "GET", headers: {} },
      tenant: { id: "test-tenant" },
    });

    expect(result1.type).toBe("screen");
    if (result1.type === "screen") {
      expect(result1.screen.title).toBe("Enter Password");
    }

    // Test with usePassword: false
    const result2 = await engine.start(
      "test-flow",
      {
        data: {},
        request: { url: "http://test", method: "GET", headers: {} },
        tenant: { id: "test-tenant" },
      },
      { usePassword: false },
    );

    expect(result2.type).toBe("screen");
    if (result2.type === "screen") {
      expect(result2.screen.title).toBe("Enter Code");
    }
  });

  it("should return error for unknown workflow", async () => {
    const storage = createMockStorage();
    const engine = new WorkflowEngine({ storage });

    const result = await engine.start("unknown-flow", {
      data: {},
      request: { url: "http://test", method: "GET", headers: {} },
      tenant: { id: "test-tenant" },
    });

    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.code).toBe("WORKFLOW_NOT_FOUND");
    }
  });

  it("should handle expired workflows", async () => {
    const storage = createMockStorage();
    const engine = new WorkflowEngine({
      storage,
      defaultExpiresIn: -1, // Already expired
    });

    const testWorkflow: WorkflowDefinition = {
      id: "test-flow",
      name: "Test Flow",
      startStep: "step1",
      steps: new Map([
        [
          "step1",
          {
            id: "step1",
            type: "screen",
            getScreen: () => ({
              action: "/submit",
              method: "POST",
              title: "Step 1",
              components: [],
            }),
          },
        ],
      ]),
    };

    engine.register(testWorkflow);

    const startResult = await engine.start("test-flow", {
      data: {},
      request: { url: "http://test", method: "GET", headers: {} },
      tenant: { id: "test-tenant" },
    });

    const stateId = (startResult as any).state.id;

    // Wait a tiny bit to ensure expiration
    await new Promise((r) => setTimeout(r, 10));

    const resumeResult = await engine.resume(stateId, {
      data: {},
      request: { url: "http://test", method: "POST", headers: {} },
      tenant: { id: "test-tenant" },
    });

    expect(resumeResult.type).toBe("error");
    if (resumeResult.type === "error") {
      expect(resumeResult.code).toBe("WORKFLOW_EXPIRED");
    }
  });
});
