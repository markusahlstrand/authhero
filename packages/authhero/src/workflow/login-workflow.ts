/**
 * Login Workflow Definition
 *
 * Defines the login flow as a workflow that can be executed by the WorkflowEngine.
 * This wraps the existing screen definitions and handlers.
 */

import type {
  WorkflowDefinition,
  StepDefinition,
  StepContext,
  StepResult,
} from "./types";
import type { UiScreen } from "@authhero/adapter-interfaces";
import {
  getScreen,
  getScreenDefinition,
  isValidScreenId,
} from "../routes/universal-login/screens/registry";
import type { ScreenContext } from "../routes/universal-login/screens/types";

/**
 * Context specific to the login workflow
 */
export interface LoginWorkflowContext {
  /** Authenticated user ID (once authenticated) */
  userId?: string;
  /** Email address being used for login */
  email?: string;
  /** Whether we're in password or passwordless mode */
  strategy?: "password" | "code";
  /** Error messages from previous step */
  errors?: Record<string, string>;
  /** Pre-filled values */
  prefill?: Record<string, string>;
}

/**
 * Create a step definition from an existing screen definition
 */
function createScreenStep(screenId: string): StepDefinition<LoginWorkflowContext> {
  return {
    id: screenId,
    type: "screen",

    getScreen(ctx: StepContext<LoginWorkflowContext>): UiScreen {
      // We need to convert StepContext to ScreenContext
      // The services should contain the necessary context
      const services = ctx.services;
      const screenContext = services.screenContext as ScreenContext;

      if (!screenContext) {
        // Return a minimal error screen if no context
        return {
          action: "",
          method: "POST",
          title: "Error",
          description: "Screen context not available",
          components: [],
          messages: [{ text: "Configuration error", type: "error" }],
        };
      }

      // Apply workflow context to screen context
      const contextWithErrors: ScreenContext = {
        ...screenContext,
        prefill: {
          ...screenContext.prefill,
          ...ctx.state.context.prefill,
          username: ctx.state.context.email,
        },
        errors: ctx.state.context.errors,
      };

      const result = getScreen(screenId, contextWithErrors);
      if (!result) {
        return {
          action: "",
          method: "POST",
          title: "Error",
          description: `Screen not found: ${screenId}`,
          components: [],
          messages: [{ text: "Screen not found", type: "error" }],
        };
      }

      return result.screen;
    },

    async execute(ctx: StepContext<LoginWorkflowContext>): Promise<StepResult> {
      // Get the screen definition to access its POST handler
      const screenDef = getScreenDefinition(screenId);
      if (!screenDef?.handler.post) {
        // No POST handler - this shouldn't happen for login screens
        return {
          type: "error",
          code: "NO_POST_HANDLER",
          message: `Screen ${screenId} has no POST handler`,
        };
      }

      const services = ctx.services;
      const screenContext = services.screenContext as ScreenContext;

      if (!screenContext) {
        return {
          type: "error",
          code: "NO_SCREEN_CONTEXT",
          message: "Screen context not available",
        };
      }

      // Apply workflow context
      const contextWithState: ScreenContext = {
        ...screenContext,
        prefill: {
          ...screenContext.prefill,
          ...ctx.state.context.prefill,
        },
        errors: ctx.state.context.errors,
        data: {
          ...screenContext.data,
          ...ctx.input,
        },
      };

      try {
        const result = await screenDef.handler.post(
          contextWithState,
          ctx.input ?? {},
        );

        if ("redirect" in result) {
          // Check if redirect is to another screen
          const url = new URL(result.redirect, screenContext.baseUrl);
          const screenMatch = url.pathname.match(/\/u(?:2)?\/(?:widget\/)?([^/?]+)/);
          const nextScreen = screenMatch?.[1];

          if (nextScreen && isValidScreenId(nextScreen)) {
            return {
              type: "next",
              step: nextScreen,
              context: {
                email: (ctx.input?.username as string) ?? ctx.state.context.email,
              },
            };
          }

          // External redirect (e.g., callback URL)
          return {
            type: "redirect",
            url: result.redirect,
          };
        }

        if ("error" in result) {
          // Return to the same screen with error
          return {
            type: "screen",
            screenId,
            context: {
              errors: { form: result.error },
            },
          };
        }

        // Screen result - stay on screen (shouldn't happen for successful submission)
        return {
          type: "screen",
          screenId,
        };
      } catch (error) {
        return {
          type: "error",
          code: "HANDLER_ERROR",
          message: error instanceof Error ? error.message : "Handler failed",
        };
      }
    },
  };
}

/**
 * The login workflow definition
 *
 * Flow:
 *   identifier → (check strategy) → enter-password OR enter-code → (post-login hooks) → complete
 */
export const loginWorkflow: WorkflowDefinition<LoginWorkflowContext> = {
  id: "login",
  name: "Login Flow",
  description: "Standard authentication flow",
  startStep: "identifier",
  defaultContext: {},

  steps: new Map([
    // Start: Identifier screen
    ["identifier", createScreenStep("identifier")],

    // Password authentication
    ["enter-password", createScreenStep("enter-password")],

    // Passwordless code authentication
    ["enter-code", createScreenStep("enter-code")],

    // Forgot password flow
    ["forgot-password", createScreenStep("forgot-password")],

    // Reset password (from email link)
    ["reset-password", createScreenStep("reset-password")],
  ]),

  hooks: {
    async onComplete(_ctx, result) {
      // Post-login hooks would be triggered here
      // For now, this is handled by the existing postUserLoginHook
      console.log("Login workflow completed:", result);
    },
  },
};

/**
 * Get the login workflow definition
 */
export function getLoginWorkflow(): WorkflowDefinition<LoginWorkflowContext> {
  return loginWorkflow;
}
