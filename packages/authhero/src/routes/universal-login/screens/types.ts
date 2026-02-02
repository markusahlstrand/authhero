/**
 * Types for built-in screens
 */

import { Context } from "hono";
import {
  UiScreen,
  Tenant,
  Theme,
  Connection,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../../../helpers/client";
import { Bindings, Variables } from "../../../types";

/**
 * Branding information for screen rendering
 */
export interface ScreenBranding {
  logo_url?: string;
  favicon_url?: string;
  powered_by_logo_url?: string;
  colors?: {
    primary?: string;
    page_background?:
      | string
      | {
          type?: string;
          start?: string;
          end?: string;
          angle_deg?: number;
        };
  };
  font?: {
    url?: string;
  };
}

/**
 * Context passed to screen factories
 */
export interface ScreenContext {
  /** The Hono context */
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  /** The current tenant */
  tenant: Tenant;
  /** The current client application - uses EnrichedClient which has full connection objects */
  client: EnrichedClient;
  /** Theme configuration */
  theme?: Theme;
  /** Branding configuration */
  branding?: ScreenBranding;
  /** Available connections for this client */
  connections: Connection[];
  /** The login state parameter */
  state: string;
  /** Base URL for the current request */
  baseUrl: string;
  /** Pre-filled values for form fields */
  prefill?: Record<string, string | undefined>;
  /** Error messages to display */
  errors?: Record<string, string>;
  /** Success messages to display */
  messages?: Array<{ text: string; type: "success" | "info" | "warning" }>;
  /** Additional screen-specific data */
  data?: Record<string, unknown>;
}

/**
 * Result from a screen factory
 */
export interface ScreenResult {
  /** The screen definition for the widget */
  screen: UiScreen;
  /** Branding to apply */
  branding?: ScreenBranding;
}

/**
 * A screen factory creates a UiScreen from context
 * Always async for consistency (even if the implementation is sync)
 */
export type ScreenFactory = (
  context: ScreenContext,
) => Promise<ScreenResult>;

/**
 * Handler for screen form submissions
 */
export interface ScreenHandler {
  /** Handle GET request - returns the screen (can be sync or async) */
  get: ScreenFactory;
  /** Handle POST request - process form data and return next screen or redirect */
  post?: (
    context: ScreenContext,
    data: Record<string, unknown>,
  ) => Promise<
    | { screen: ScreenResult }
    | { redirect: string }
    | { error: string; screen: ScreenResult }
  >;
}

/**
 * Screen definition including factory and optional handler
 */
export interface ScreenDefinition {
  /** Unique screen ID (matches route path) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
  /** The screen handler */
  handler: ScreenHandler;
}
