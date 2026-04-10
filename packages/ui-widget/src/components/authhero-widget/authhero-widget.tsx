import {
  Component,
  h,
  Prop,
  State,
  Event,
  EventEmitter,
  Watch,
  Element,
} from "@stencil/core";
import type {
  UiScreen,
  FormComponent,
  DividerComponent,
} from "../../types/components";
import type { WidgetBranding, WidgetTheme } from "../../utils/branding";
import { mergeThemeVars, applyCssVars } from "../../utils/branding";
import { sanitizeHtml } from "../../utils/sanitize-html";

/**
 * Submit event detail - emitted when a form is submitted
 */
export interface SubmitEventDetail {
  /** The current screen configuration */
  screen: UiScreen;
  /** Form field values keyed by component ID */
  data: Record<string, string>;
}

/**
 * Button click event detail - emitted when a non-submit button is clicked
 */
export interface ButtonClickEventDetail {
  /** Component ID */
  id: string;
  /** Component type (e.g., 'SOCIAL', 'BACK_BUTTON') */
  type: string;
  /** Optional value (e.g., connection name for social buttons) */
  value?: string;
}

/**
 * Link click event detail - emitted when a link is clicked
 */
export interface LinkClickEventDetail {
  /** Link ID */
  id?: string;
  /** Link href */
  href: string;
  /** Link text */
  text: string;
}

/**
 * Navigate event detail - emitted when the widget wants to navigate
 */
export interface NavigateEventDetail {
  /** URL to navigate to */
  url: string;
  /** Whether to replace the current history entry */
  replace?: boolean;
}

/**
 * Complete event detail - emitted when auth flow completes
 */
export interface CompleteEventDetail {
  /** Redirect URL (contains code for authorization code flow) */
  redirectUrl?: string;
}

/**
 * Error event detail - emitted on errors
 */
export interface ErrorEventDetail {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
}

/**
 * Union type for all WebAuthn ceremony payloads
 */
type WebAuthnCeremonyPayload =
  | {
      type: "webauthn-registration";
      options: {
        challenge: string;
        rp: { id: string; name: string };
        user: { id: string; name: string; displayName: string };
        pubKeyCredParams: Array<{ alg: number; type: string }>;
        timeout?: number;
        attestation?: string;
        authenticatorSelection?: {
          residentKey?: string;
          userVerification?: string;
        };
        excludeCredentials?: Array<{
          id: string;
          type: string;
          transports?: string[];
        }>;
      };
      successAction: string;
    }
  | {
      type: "webauthn-authentication";
      options: {
        challenge: string;
        rpId?: string;
        timeout?: number;
        userVerification?: string;
        allowCredentials?: Array<{
          id: string;
          type: string;
          transports?: string[];
        }>;
      };
      successAction: string;
    }
  | {
      type: "webauthn-authentication-conditional";
      options: {
        challenge: string;
        rpId?: string;
        timeout?: number;
        userVerification?: string;
        allowCredentials?: Array<{
          id: string;
          type: string;
          transports?: string[];
        }>;
      };
      successAction: string;
    };

/**
 * Auth params needed for social login and OAuth flows
 */
export interface AuthParams {
  client_id: string;
  redirect_uri?: string;
  scope?: string;
  audience?: string;
  nonce?: string;
  response_type?: string;
  state?: string;
}

/**
 * State persistence mode - where to track state and screen
 */
export type StatePersistence = "url" | "session" | "memory";

@Component({
  tag: "authhero-widget",
  styleUrl: "authhero-widget.css",
  shadow: true,
})
export class AuthheroWidget {
  @Element() el!: HTMLElement;

  /**
   * The UI screen configuration from the server.
   * Can be passed as a JSON string or object.
   * Follows Auth0 Forms component schema.
   */
  @Prop() screen?: UiScreen | string;

  /**
   * API endpoint to fetch the initial screen from.
   * If provided, the widget will fetch the screen on load.
   * Can include {screenId} placeholder which will be replaced with the current screen.
   * Example: "/u2/screen/{screenId}" or "https://auth.example.com/u2/screen/{screenId}"
   */
  @Prop() apiUrl?: string;

  /**
   * Base URL for all API calls. Used when widget is embedded on a different domain.
   * If not provided, relative URLs are used.
   * Example: "https://auth.example.com"
   */
  @Prop() baseUrl?: string;

  /**
   * Login session state token. Required for social login and maintaining session.
   */
  @Prop({ mutable: true }) state?: string;

  /**
   * Current screen ID. Used with apiUrl to fetch screen configuration.
   * When statePersistence is 'url', this is synced with the URL.
   */
  @Prop({ mutable: true }) screenId?: string;

  @Watch("screenId")
  watchScreenId() {
    this.updateDataScreenAttribute();
  }

  /**
   * OAuth/OIDC parameters for social login redirects.
   * Can be passed as a JSON string or object.
   */
  @Prop() authParams?: AuthParams | string;

  /**
   * Where to persist state and screen ID.
   * - 'url': Updates URL path/query (default for standalone pages)
   * - 'session': Uses sessionStorage (for embedded widgets)
   * - 'memory': No persistence, state only in memory
   * @default 'memory'
   */
  @Prop() statePersistence: StatePersistence = "memory";

  /**
   * Storage key prefix for session/local storage persistence.
   * @default 'authhero_widget'
   */
  @Prop() storageKey = "authhero_widget";

  /**
   * Branding configuration from AuthHero API.
   * Controls logo, primary color, and page background.
   * Can be passed as a JSON string or object.
   */
  @Prop() branding?: WidgetBranding | string;

  /**
   * Theme configuration from AuthHero API.
   * Controls colors, borders, fonts, and layout.
   * Can be passed as a JSON string or object.
   */
  @Prop() theme?: WidgetTheme | string;

  /**
   * Whether the widget is in a loading state.
   */
  @Prop({ mutable: true }) loading = false;

  /**
   * Whether the widget should automatically submit forms to the action URL.
   * When false (default), the widget only emits events and the consuming
   * application handles all HTTP requests.
   * When true, the widget handles form submission and screen updates.
   * @default false
   */
  @Prop() autoSubmit = false;

  /**
   * Whether the widget should handle navigation automatically.
   * When true, social login buttons redirect, links navigate, etc.
   * When false, only events are emitted.
   * @default false (same as autoSubmit when not specified)
   */
  @Prop() autoNavigate?: boolean;

  /**
   * Internal parsed screen state.
   */
  @State() _screen?: UiScreen;

  /**
   * Internal parsed auth params state.
   */
  @State() _authParams?: AuthParams;

  /**
   * Internal parsed branding state.
   */
  @State() _branding?: WidgetBranding;

  /**
   * Internal parsed theme state.
   */
  @State() _theme?: WidgetTheme;

  /**
   * Form data collected from inputs.
   */
  @State() formData: Record<string, string> = {};

  /**
   * AbortController for an in-flight conditional mediation request.
   * Aborted on screen change or component disconnect.
   */
  private conditionalMediationAbort?: AbortController;

  /**
   * Emitted when the form is submitted.
   * The consuming application should handle the submission unless autoSubmit is true.
   */
  @Event() formSubmit!: EventEmitter<SubmitEventDetail>;

  /**
   * Emitted when a non-submit button is clicked (social login, back, etc.).
   * The consuming application decides what to do based on id/type/value.
   */
  @Event() buttonClick!: EventEmitter<ButtonClickEventDetail>;

  /**
   * Emitted when a link is clicked.
   * The consuming application decides how to handle navigation.
   */
  @Event() linkClick!: EventEmitter<LinkClickEventDetail>;

  /**
   * Emitted when the widget wants to navigate (e.g., after successful auth).
   * The consuming application decides how to handle navigation.
   */
  @Event() navigate!: EventEmitter<NavigateEventDetail>;

  /**
   * Emitted when auth flow completes with a redirect URL.
   * The consuming application can redirect or extract the code.
   */
  @Event() flowComplete!: EventEmitter<CompleteEventDetail>;

  /**
   * Emitted when an error occurs.
   */
  @Event() flowError!: EventEmitter<ErrorEventDetail>;

  /**
   * Emitted when the screen changes.
   */
  @Event() screenChange!: EventEmitter<UiScreen>;
  @Watch("screen")
  watchScreen(newValue: UiScreen | string | undefined) {
    // Abort any in-flight conditional mediation when screen changes
    this.conditionalMediationAbort?.abort();
    this.conditionalMediationAbort = undefined;

    if (typeof newValue === "string") {
      try {
        this._screen = JSON.parse(newValue);
      } catch {
        console.error("Failed to parse screen JSON");
      }
    } else {
      this._screen = newValue;
    }
    if (this._screen) {
      this.formData = {};
      this.initFormDataFromDefaults(this._screen);
      this.screenChange.emit(this._screen);
      this.updateDataScreenAttribute();
    }
  }

  /**
   * Initialize formData from component default_value configs.
   * This pre-fills form fields with values resolved on the server
   * (e.g. from user profile context).
   */
  private initFormDataFromDefaults(screen: UiScreen) {
    const defaults: Record<string, string> = {};
    for (const comp of screen.components || []) {
      if (
        "config" in comp &&
        comp.config &&
        "default_value" in comp.config &&
        comp.config.default_value
      ) {
        const val = comp.config.default_value;
        if (typeof val === "string" && val !== "") {
          defaults[comp.id] = val;
        }
      }
    }
    if (Object.keys(defaults).length > 0) {
      this.formData = { ...defaults, ...this.formData };
    }
  }

  /**
   * Updates the data-screen attribute on the host element and its parent container.
   * This allows external CSS to target different screens using attribute selectors.
   * The parent container (e.g. widget-container div from SSR) is also updated
   * so that page-level CSS selectors work during SPA navigation.
   */
  private updateDataScreenAttribute() {
    const screenName = this._screen?.name || this.screenId;
    if (screenName) {
      this.el.setAttribute("data-screen", screenName);
    } else {
      this.el.removeAttribute("data-screen");
    }
    // Also update the nearest ancestor widget-container's data-screen
    // (identified by the data-authhero-widget-container marker). We use
    // closest() instead of parentElement because WidgetContent in
    // u2-routes.tsx wraps the widget in an intermediate
    // <div data-screen={screenId}>, so parentElement would hit that wrapper
    // rather than the marked .widget-container. This keeps page-level CSS
    // selectors like .widget-container[data-screen="..."] in sync during
    // client-side navigation without mutating arbitrary consumer-owned
    // elements.
    const container = this.el.closest("[data-authhero-widget-container]");
    if (container) {
      if (screenName) {
        container.setAttribute("data-screen", screenName);
      } else {
        container.removeAttribute("data-screen");
      }
    }
  }

  @Watch("branding")
  watchBranding(newValue: WidgetBranding | string | undefined) {
    if (typeof newValue === "string") {
      try {
        this._branding = JSON.parse(newValue);
      } catch {
        console.error("Failed to parse branding JSON");
      }
    } else {
      this._branding = newValue;
    }
    this.applyThemeStyles();
  }

  @Watch("theme")
  watchTheme(newValue: WidgetTheme | string | undefined) {
    if (typeof newValue === "string") {
      try {
        this._theme = JSON.parse(newValue);
      } catch {
        console.error("Failed to parse theme JSON");
      }
    } else {
      this._theme = newValue;
    }
    this.applyThemeStyles();
  }

  @Watch("authParams")
  watchAuthParams(newValue: AuthParams | string | undefined) {
    if (typeof newValue === "string") {
      try {
        this._authParams = JSON.parse(newValue);
      } catch {
        console.error("Failed to parse authParams JSON");
      }
    } else {
      this._authParams = newValue;
    }
  }

  /**
   * Apply branding and theme as CSS custom properties
   */
  private applyThemeStyles() {
    const vars = mergeThemeVars(this._branding, this._theme);
    applyCssVars(this.el, vars);
  }

  /**
   * Focus the first input field in the form.
   * Called after screen changes to ensure keyboard navigation works properly.
   */
  private focusFirstInput() {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      const shadowRoot = this.el.shadowRoot;
      if (!shadowRoot) return;

      // Find all authhero-node components and look for inputs in their shadow DOMs
      const nodes = shadowRoot.querySelectorAll("authhero-node");
      for (const node of Array.from(nodes)) {
        const nodeShadow = node.shadowRoot;
        if (nodeShadow) {
          const input = nodeShadow.querySelector(
            'input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), textarea:not([disabled])',
          ) as HTMLElement;
          if (input) {
            input.focus();
            return;
          }
        }
      }
    });
  }

  /**
   * Get the effective autoNavigate value (defaults to autoSubmit if not set)
   */
  private get shouldAutoNavigate(): boolean {
    return this.autoNavigate ?? this.autoSubmit;
  }

  /**
   * Build the full URL for API calls
   */
  private buildUrl(path: string): string {
    if (this.baseUrl) {
      return new URL(path, this.baseUrl).toString();
    }
    return path;
  }

  /**
   * Load state from URL or storage based on statePersistence setting
   */
  private loadPersistedState() {
    if (this.statePersistence === "url") {
      const url = new URL(window.location.href);
      const stateParam = url.searchParams.get("state");
      if (stateParam && !this.state) {
        this.state = stateParam;
      }
    } else if (this.statePersistence === "session") {
      try {
        const stored = sessionStorage.getItem(`${this.storageKey}_state`);
        if (stored && !this.state) {
          this.state = stored;
        }
        const storedScreenId = sessionStorage.getItem(
          `${this.storageKey}_screenId`,
        );
        if (storedScreenId && !this.screenId) {
          this.screenId = storedScreenId;
        }
      } catch {
        // sessionStorage not available
      }
    }
  }

  /**
   * Save state to URL or storage based on statePersistence setting
   */
  private persistState() {
    if (this.statePersistence === "url") {
      const url = new URL(window.location.href);
      if (this.state) {
        url.searchParams.set("state", this.state);
      }
      if (this.screenId) {
        url.searchParams.set("screen", this.screenId);
      }
      window.history.replaceState({}, "", url.toString());
    } else if (this.statePersistence === "session") {
      try {
        if (this.state) {
          sessionStorage.setItem(`${this.storageKey}_state`, this.state);
        }
        if (this.screenId) {
          sessionStorage.setItem(`${this.storageKey}_screenId`, this.screenId);
        }
      } catch {
        // sessionStorage not available
      }
    }
  }

  private handlePopState = (event: PopStateEvent) => {
    if (!this.apiUrl) return;

    // Restore the widget state token from history if present
    if (event.state?.state) {
      this.state = event.state.state;
    }

    // Derive screen from history state or from the current URL
    const screen =
      event.state?.screen ?? this.extractScreenIdFromHref(location.href);

    if (screen) {
      this.fetchScreen(screen);
    }
  };

  connectedCallback() {
    window.addEventListener("popstate", this.handlePopState);
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this.handlePopState);
    this.conditionalMediationAbort?.abort();
    this.conditionalMediationAbort = undefined;
  }

  async componentWillLoad() {
    // Parse initial props - this prevents unnecessary state changes during hydration that cause flashes
    // Also check the element attribute as a fallback for hydration scenarios
    if (!this._screen) {
      const screenValue = this.screen || this.el?.getAttribute("screen");
      if (screenValue) {
        this.watchScreen(screenValue);
      }
    }
    if (!this._branding) {
      this.watchBranding(this.branding);
    }
    if (!this._theme) {
      this.watchTheme(this.theme);
    }
    if (!this._authParams) {
      this.watchAuthParams(this.authParams);
    }

    // Load persisted state if available
    this.loadPersistedState();

    // Fetch screen from API if URL provided and no screen prop
    if (this.apiUrl && !this._screen) {
      await this.fetchScreen(this.screenId);
    }
  }

  /**
   * Fetch screen configuration from the API
   * @param screenIdOverride Optional screen ID to fetch (overrides this.screenId)
   * @param nodeId Optional node ID for flow navigation
   */
  async fetchScreen(
    screenIdOverride?: string,
    nodeId?: string,
  ): Promise<boolean> {
    if (!this.apiUrl) return false;

    const currentScreenId = screenIdOverride || this.screenId;

    // Build the API URL, replacing {screenId} placeholder if present
    let url = this.apiUrl;
    if (currentScreenId && url.includes("{screenId}")) {
      url = url.replace("{screenId}", encodeURIComponent(currentScreenId));
    }

    // Add state and nodeId as query params
    const urlObj = new URL(url, this.baseUrl || window.location.origin);
    if (this.state) {
      urlObj.searchParams.set("state", this.state);
    }
    if (nodeId) {
      urlObj.searchParams.set("nodeId", nodeId);
    }

    this.loading = true;
    try {
      const response = await fetch(
        this.buildUrl(urlObj.pathname + urlObj.search),
        {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();

        // Handle different response formats
        if (data.screen) {
          this._screen = data.screen;
          if (data.branding) {
            this._branding = data.branding;
            this.applyThemeStyles();
          }
          // Update state if returned
          if (data.state) {
            this.state = data.state;
          }
          // Update screenId if returned in response
          if (data.screenId) {
            this.screenId = data.screenId;
          }
        } else {
          // Response is the screen itself
          this._screen = data;
        }

        if (this._screen) {
          // If we fetched with a screenId override, update our stored screenId
          if (currentScreenId && currentScreenId !== this.screenId) {
            this.screenId = currentScreenId;
          }
          this.initFormDataFromDefaults(this._screen);
          this.screenChange.emit(this._screen);
          this.updateDataScreenAttribute();
          this.persistState();
          this.focusFirstInput();

          // Start WebAuthn ceremony if returned with the screen (e.g. conditional mediation)
          if (data.ceremony) {
            this.performWebAuthnCeremony(data.ceremony);
          }

          return true;
        }
      } else {
        const error = await response
          .json()
          .catch(() => ({ message: "Failed to load screen" }));
        this.flowError.emit({
          message: error.message || "Failed to load screen",
        });
      }
    } catch (error) {
      console.error("Failed to fetch screen:", error);
      this.flowError.emit({
        message:
          error instanceof Error ? error.message : "Failed to fetch screen",
      });
    } finally {
      this.loading = false;
    }
    return false;
  }

  private handleInputChange = (name: string, value: string) => {
    this.formData = {
      ...this.formData,
      [name]: value,
    };
  };

  private handleSubmit = async (
    e: Event,
    overrideData?: Record<string, string>,
  ) => {
    e.preventDefault();

    if (!this._screen || this.loading) return;

    let submitData = { ...this.formData, ...(overrideData || {}) };

    // Merge hidden input values from DOM (may have been set programmatically
    // by inline scripts, e.g. passkey management buttons)
    const form = this.el.shadowRoot?.querySelector("form");
    if (form) {
      const hiddenInputs = form.querySelectorAll<HTMLInputElement>(
        'input[type="hidden"]',
      );
      hiddenInputs.forEach((input) => {
        if (input.name && input.value) {
          submitData[input.name] = input.value;
        }
      });
    }

    // Always emit the submit event
    this.formSubmit.emit({
      screen: this._screen,
      data: submitData,
    });

    // If autoSubmit is disabled, let the consuming app handle it
    if (!this.autoSubmit) {
      return;
    }

    // For GET actions (or missing method), navigate directly instead of fetching
    if (!this._screen.method || this._screen.method.toUpperCase() === "GET") {
      window.location.href = this.buildUrl(this._screen.action);
      return;
    }

    // Submit to the server
    this.loading = true;
    try {
      const response = await fetch(this.buildUrl(this._screen.action), {
        method: this._screen.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ data: submitData }),
      });

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const result = await response.json();

        // Handle different response types
        if (result.redirect) {
          // Auth complete - emit complete event
          this.flowComplete.emit({ redirectUrl: result.redirect });
          // Also emit navigate for backwards compatibility
          this.navigate.emit({ url: result.redirect });
          // Auto-navigate if enabled
          if (this.shouldAutoNavigate) {
            window.location.href = result.redirect;
          }
        } else if (!response.ok && result.screen) {
          // Handle validation errors (400 response) — preserve user input
          this._screen = result.screen;
          this.initFormDataFromDefaults(result.screen);
          this.screenChange.emit(result.screen);
          this.updateDataScreenAttribute();
          this.focusFirstInput();
        } else if (result.screen) {
          // Next screen (success)
          this._screen = result.screen;
          this.formData = {};
          this.initFormDataFromDefaults(result.screen);
          this.screenChange.emit(result.screen);
          this.updateDataScreenAttribute();

          // Update screenId if returned in response
          if (result.screenId) {
            this.screenId = result.screenId;
          }

          // Persist state (especially for session storage mode)
          this.persistState();

          // Update URL path if navigateUrl is provided (client-side navigation)
          if (result.navigateUrl && this.shouldAutoNavigate) {
            window.history.pushState(
              { screen: result.screenId, state: this.state },
              "",
              result.navigateUrl,
            );
          }

          // Apply branding if included
          if (result.branding) {
            this._branding = result.branding;
            this.applyThemeStyles();
          }

          // Update state if returned
          if (result.state) {
            this.state = result.state;
            this.persistState();
          }

          // Perform WebAuthn ceremony if present (structured data, not script)
          if (result.ceremony) {
            this.performWebAuthnCeremony(result.ceremony);
          }

          // Focus first input on new screen
          this.focusFirstInput();
        } else if (result.complete) {
          // Flow complete without redirect
          this.flowComplete.emit({});
        } else if (!response.ok && result.error) {
          // Server returned an error without a screen (e.g. 500)
          // Show the error on the current screen
          if (this._screen) {
            this._screen = {
              ...this._screen,
              messages: [
                ...(this._screen.messages || []),
                { text: result.error, type: "error" as const },
              ],
            };
          }
          this.flowError.emit({ message: result.error });
        }
      }
    } catch (err) {
      console.error("Form submission failed:", err);
      this.flowError.emit({
        message: err instanceof Error ? err.message : "Form submission failed",
      });
    } finally {
      this.loading = false;
    }
  };

  /**
   * Override form.submit() so that scripts (e.g. WebAuthn ceremony) that call
   * form.submit() go through the widget's JSON fetch pipeline instead of a
   * native form-urlencoded POST.
   */
  private overrideFormSubmit() {
    const shadowRoot = this.el.shadowRoot;
    if (!shadowRoot) return;

    const form = shadowRoot.querySelector("form");
    if (!form) return;

    form.submit = () => {
      const formData = new FormData(form);
      const data: Record<string, string> = {};
      formData.forEach((value, key) => {
        if (typeof value === "string") {
          data[key] = value;
        }
      });
      const syntheticEvent = { preventDefault: () => {} } as Event;
      this.handleSubmit(syntheticEvent, data);
    };
  }

  /**
   * Validate and execute a structured WebAuthn ceremony returned by the server.
   * Instead of injecting arbitrary script content, this parses the ceremony JSON,
   * validates the expected fields, and calls the WebAuthn API natively.
   */
  private performWebAuthnCeremony(ceremony: unknown) {
    if (!this.isValidWebAuthnCeremony(ceremony)) {
      console.error("Invalid WebAuthn ceremony payload", ceremony);
      return;
    }

    if (ceremony.type === "webauthn-authentication-conditional") {
      // Conditional mediation runs in the background, no requestAnimationFrame needed
      this.executeWebAuthnConditionalMediation(ceremony);
      return;
    }

    requestAnimationFrame(() => {
      this.overrideFormSubmit();
      if (ceremony.type === "webauthn-authentication") {
        this.executeWebAuthnAuthentication(ceremony);
      } else {
        this.executeWebAuthnRegistration(ceremony);
      }
    });
  }

  /**
   * Schema validation for WebAuthn ceremony payloads.
   * Checks required fields and types before invoking browser APIs.
   */
  private isValidWebAuthnCeremony(
    data: unknown,
  ): data is WebAuthnCeremonyPayload {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    if (typeof obj.successAction !== "string") return false;

    const opts = obj.options;
    if (typeof opts !== "object" || opts === null) return false;
    const o = opts as Record<string, unknown>;
    if (typeof o.challenge !== "string") return false;

    if (obj.type === "webauthn-registration") {
      const rp = o.rp;
      if (typeof rp !== "object" || rp === null) return false;
      if (
        typeof (rp as Record<string, unknown>).id !== "string" ||
        typeof (rp as Record<string, unknown>).name !== "string"
      )
        return false;

      const user = o.user;
      if (typeof user !== "object" || user === null) return false;
      const u = user as Record<string, unknown>;
      if (
        typeof u.id !== "string" ||
        typeof u.name !== "string" ||
        typeof u.displayName !== "string"
      )
        return false;

      if (!Array.isArray(o.pubKeyCredParams)) return false;
      return true;
    }

    if (
      obj.type === "webauthn-authentication" ||
      obj.type === "webauthn-authentication-conditional"
    ) {
      return true;
    }

    return false;
  }

  /**
   * Perform the WebAuthn navigator.credentials.create() ceremony and submit
   * the credential result via the form.
   */
  private async executeWebAuthnRegistration(ceremony: {
    type: "webauthn-registration";
    options: {
      challenge: string;
      rp: { id: string; name: string };
      user: { id: string; name: string; displayName: string };
      pubKeyCredParams: Array<{ alg: number; type: string }>;
      timeout?: number;
      attestation?: string;
      authenticatorSelection?: {
        residentKey?: string;
        userVerification?: string;
      };
      excludeCredentials?: Array<{
        id: string;
        type: string;
        transports?: string[];
      }>;
    };
    successAction: string;
  }) {
    const opts = ceremony.options;

    const b64uToBuf = (s: string): ArrayBuffer => {
      s = s.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      const b = atob(s);
      const a = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
      return a.buffer;
    };

    const bufToB64u = (b: ArrayBuffer): string => {
      const a = new Uint8Array(b);
      let s = "";
      for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      return btoa(s)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };

    const findForm = (): HTMLFormElement | null => {
      const shadowRoot = this.el?.shadowRoot;
      if (shadowRoot) {
        const f = shadowRoot.querySelector("form");
        if (f) return f;
      }
      return document.querySelector("form");
    };

    try {
      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: b64uToBuf(opts.challenge),
        rp: { id: opts.rp.id, name: opts.rp.name },
        user: {
          id: b64uToBuf(opts.user.id),
          name: opts.user.name,
          displayName: opts.user.displayName,
        },
        pubKeyCredParams: opts.pubKeyCredParams.map((p) => ({
          alg: p.alg,
          type: p.type as PublicKeyCredentialType,
        })),
        timeout: opts.timeout,
        attestation: (opts.attestation || "none") as AttestationConveyancePreference,
        authenticatorSelection: opts.authenticatorSelection
          ? {
              residentKey: (opts.authenticatorSelection.residentKey ||
                "preferred") as ResidentKeyRequirement,
              userVerification: (opts.authenticatorSelection
                .userVerification ||
                "preferred") as UserVerificationRequirement,
            }
          : undefined,
      };

      if (opts.excludeCredentials?.length) {
        publicKey.excludeCredentials = opts.excludeCredentials.map((c) => ({
          id: b64uToBuf(c.id),
          type: c.type as PublicKeyCredentialType,
          transports: (c.transports || []) as AuthenticatorTransport[],
        }));
      }

      const cred = (await navigator.credentials.create({
        publicKey,
      })) as PublicKeyCredential;

      const response = cred.response as AuthenticatorAttestationResponse;
      const resp: Record<string, unknown> = {
        id: cred.id,
        rawId: bufToB64u(cred.rawId),
        type: cred.type,
        response: {
          attestationObject: bufToB64u(response.attestationObject),
          clientDataJSON: bufToB64u(response.clientDataJSON),
        },
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment:
          (cred as any).authenticatorAttachment || undefined,
      };

      if (typeof response.getTransports === "function") {
        (resp.response as Record<string, unknown>).transports =
          response.getTransports();
      }

      const form = findForm();
      if (form) {
        const cf =
          form.querySelector<HTMLInputElement>('[name="credential-field"]') ||
          form.querySelector<HTMLInputElement>("#credential-field");
        const af =
          form.querySelector<HTMLInputElement>('[name="action-field"]') ||
          form.querySelector<HTMLInputElement>("#action-field");
        if (cf) cf.value = JSON.stringify(resp);
        if (af) af.value = ceremony.successAction;
        form.submit();
      }
    } catch (e) {
      console.error("WebAuthn registration error:", e);
      const form = findForm();
      if (form) {
        const af =
          form.querySelector<HTMLInputElement>('[name="action-field"]') ||
          form.querySelector<HTMLInputElement>("#action-field");
        if (af) af.value = "error";
        form.submit();
      }
    }
  }

  /**
   * Perform the WebAuthn navigator.credentials.get() ceremony (explicit modal)
   * and submit the credential result via the form.
   */
  private async executeWebAuthnAuthentication(ceremony: {
    type: "webauthn-authentication";
    options: {
      challenge: string;
      rpId?: string;
      timeout?: number;
      userVerification?: string;
      allowCredentials?: Array<{
        id: string;
        type: string;
        transports?: string[];
      }>;
    };
    successAction: string;
  }) {
    const opts = ceremony.options;

    const b64uToBuf = (s: string): ArrayBuffer => {
      s = s.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      const b = atob(s);
      const a = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
      return a.buffer;
    };

    const bufToB64u = (b: ArrayBuffer): string => {
      const a = new Uint8Array(b);
      let s = "";
      for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      return btoa(s)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };

    const findForm = (): HTMLFormElement | null => {
      const shadowRoot = this.el?.shadowRoot;
      if (shadowRoot) {
        const f = shadowRoot.querySelector("form");
        if (f) return f;
      }
      return document.querySelector("form");
    };

    try {
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: b64uToBuf(opts.challenge),
        rpId: opts.rpId,
        timeout: opts.timeout,
        userVerification:
          (opts.userVerification as UserVerificationRequirement) || "preferred",
      };

      if (opts.allowCredentials?.length) {
        publicKey.allowCredentials = opts.allowCredentials.map((c) => ({
          id: b64uToBuf(c.id),
          type: c.type as PublicKeyCredentialType,
          transports: (c.transports || []) as AuthenticatorTransport[],
        }));
      }

      const cred = (await navigator.credentials.get({
        publicKey,
      })) as PublicKeyCredential;

      const response = cred.response as AuthenticatorAssertionResponse;
      const resp: Record<string, unknown> = {
        id: cred.id,
        rawId: bufToB64u(cred.rawId),
        type: cred.type,
        response: {
          authenticatorData: bufToB64u(response.authenticatorData),
          clientDataJSON: bufToB64u(response.clientDataJSON),
          signature: bufToB64u(response.signature),
        },
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment:
          (cred as any).authenticatorAttachment || undefined,
      };

      if (response.userHandle) {
        (resp.response as Record<string, unknown>).userHandle = bufToB64u(
          response.userHandle,
        );
      }

      const form = findForm();
      if (form) {
        const cf =
          form.querySelector<HTMLInputElement>('[name="credential-field"]') ||
          form.querySelector<HTMLInputElement>("#credential-field");
        const af =
          form.querySelector<HTMLInputElement>('[name="action-field"]') ||
          form.querySelector<HTMLInputElement>("#action-field");
        if (cf) cf.value = JSON.stringify(resp);
        if (af) af.value = ceremony.successAction;
        form.submit();
      }
    } catch (e) {
      console.error("WebAuthn authentication error:", e);
      const form = findForm();
      if (form) {
        const af =
          form.querySelector<HTMLInputElement>('[name="action-field"]') ||
          form.querySelector<HTMLInputElement>("#action-field");
        if (af) af.value = "error";
        form.submit();
      }
    }
  }

  /**
   * Execute WebAuthn conditional mediation (autofill-assisted passkeys).
   * Runs in the background — the browser shows passkey suggestions in the
   * username field's autofill dropdown. Silently ignored if unsupported.
   */
  private async executeWebAuthnConditionalMediation(ceremony: {
    type: "webauthn-authentication-conditional";
    options: {
      challenge: string;
      rpId?: string;
      timeout?: number;
      userVerification?: string;
    };
    successAction: string;
  }) {
    // Feature detection
    if (
      !window.PublicKeyCredential ||
      !(PublicKeyCredential as any).isConditionalMediationAvailable
    ) {
      return;
    }

    const available = await (
      PublicKeyCredential as any
    ).isConditionalMediationAvailable();
    if (!available) return;

    // Abort any previous conditional mediation request
    this.conditionalMediationAbort?.abort();
    const abortController = new AbortController();
    this.conditionalMediationAbort = abortController;

    const opts = ceremony.options;

    const b64uToBuf = (s: string): ArrayBuffer => {
      s = s.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      const b = atob(s);
      const a = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
      return a.buffer;
    };

    const bufToB64u = (b: ArrayBuffer): string => {
      const a = new Uint8Array(b);
      let s = "";
      for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      return btoa(s)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };

    try {
      const cred = (await navigator.credentials.get({
        mediation: "conditional" as CredentialMediationRequirement,
        signal: abortController.signal,
        publicKey: {
          challenge: b64uToBuf(opts.challenge),
          rpId: opts.rpId,
          timeout: opts.timeout,
          userVerification:
            (opts.userVerification as UserVerificationRequirement) ||
            "preferred",
        },
      })) as PublicKeyCredential;

      const response = cred.response as AuthenticatorAssertionResponse;
      const resp: Record<string, unknown> = {
        id: cred.id,
        rawId: bufToB64u(cred.rawId),
        type: cred.type,
        response: {
          authenticatorData: bufToB64u(response.authenticatorData),
          clientDataJSON: bufToB64u(response.clientDataJSON),
          signature: bufToB64u(response.signature),
        },
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment:
          (cred as any).authenticatorAttachment || undefined,
      };

      if (response.userHandle) {
        (resp.response as Record<string, unknown>).userHandle = bufToB64u(
          response.userHandle,
        );
      }

      // Submit via the widget's form handling
      this.formData["credential-field"] = JSON.stringify(resp);
      this.formData["action-field"] = ceremony.successAction;

      // Ensure form submit override is set up, then submit
      this.overrideFormSubmit();
      const shadowRoot = this.el?.shadowRoot;
      const form = shadowRoot?.querySelector("form");
      if (form) {
        // Set the hidden input values directly
        const cf =
          form.querySelector<HTMLInputElement>('[name="credential-field"]') ||
          form.querySelector<HTMLInputElement>("#credential-field");
        const af =
          form.querySelector<HTMLInputElement>('[name="action-field"]') ||
          form.querySelector<HTMLInputElement>("#action-field");
        if (cf) cf.value = JSON.stringify(resp);
        if (af) af.value = ceremony.successAction;
        form.submit();
      }
    } catch (e: any) {
      // Silently ignore AbortError and NotAllowedError
      if (e?.name === "AbortError" || e?.name === "NotAllowedError") return;
      console.error("Conditional mediation error:", e);
    }
  }

  private handleButtonClick = (detail: ButtonClickEventDetail) => {
    // If this is a submit button click, trigger form submission
    if (detail.type === "submit") {
      // For GET screens (or missing method), navigate directly — no form submission needed
      if (
        (!this._screen?.method ||
          this._screen.method.toUpperCase() === "GET") &&
        this._screen?.action
      ) {
        window.location.href = this.buildUrl(this._screen.action);
        return;
      }
      // Include the clicked button's ID in form data so the server
      // can identify which button was clicked (e.g. for multi-button screens
      // like mfa-login-options where each factor has its own submit button)
      const submitData = { ...this.formData, [detail.id]: "true" };
      this.formData = submitData;
      // Create a synthetic submit event and call handleSubmit
      // Pass submitData directly to avoid @State() timing issues
      const syntheticEvent = { preventDefault: () => {} } as Event;
      this.handleSubmit(syntheticEvent, submitData);
      return;
    }

    // Always emit the event
    this.buttonClick.emit(detail);

    // Handle social login if autoNavigate is enabled
    if (detail.type === "SOCIAL" && detail.value && this.shouldAutoNavigate) {
      // Check if this provider has an href (e.g. passwordless connections)
      const providerHref = this.getProviderHref(detail.value);
      if (providerHref) {
        const screenId = this.extractScreenIdFromHref(providerHref);
        if (screenId && this.apiUrl) {
          this.navigateToScreen(screenId, providerHref);
        } else {
          window.location.href = providerHref;
        }
        return;
      }
      this.handleSocialLogin(detail.value);
      return;
    }

    // Handle resend button
    if (detail.type === "RESEND_BUTTON" && this.shouldAutoNavigate) {
      this.handleResend();
      return;
    }
  };

  /**
   * Handle social login redirect
   */
  private handleSocialLogin(connection: string) {
    const params: Partial<AuthParams> = this._authParams || {};

    const queryParams: Record<string, string> = {
      connection,
    };

    // Add state
    if (this.state) {
      queryParams.state = this.state;
    } else if (params.state) {
      queryParams.state = params.state;
    }

    // Add client_id
    if (params.client_id) {
      queryParams.client_id = params.client_id;
    }

    // Add optional params
    if (params.redirect_uri) queryParams.redirect_uri = params.redirect_uri;
    if (params.scope) queryParams.scope = params.scope;
    if (params.audience) queryParams.audience = params.audience;
    if (params.nonce) queryParams.nonce = params.nonce;
    if (params.response_type) queryParams.response_type = params.response_type;

    const socialUrl = this.buildUrl(
      "/authorize?" + new URLSearchParams(queryParams).toString(),
    );

    // Emit navigate event and redirect
    this.navigate.emit({ url: socialUrl });
    window.location.href = socialUrl;
  }

  /**
   * Handle resend button click (e.g., resend OTP code)
   */
  private async handleResend() {
    if (!this._screen?.action) return;

    try {
      const url =
        this._screen.action +
        (this._screen.action.includes("?") ? "&" : "?") +
        "action=resend";
      await fetch(this.buildUrl(url), {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Resend failed:", error);
    }
  }

  /**
   * Extract screen ID from a u2 link href.
   * Handles patterns like /u2/login/{screenId}?state=... and /u2/{screenId}?state=...
   * Returns the screen ID or null if the href doesn't match a known pattern.
   */
  private extractScreenIdFromHref(href: string): string | null {
    try {
      const url = new URL(href, window.location.origin);
      const path = url.pathname;

      // Match /u2/login/{screenId} (e.g., /u2/login/identifier)
      const loginMatch = path.match(/\/u2\/login\/([^/]+)$/);
      if (loginMatch) return loginMatch[1];

      // Match /u2/{screenId} (e.g., /u2/signup, /u2/enter-password)
      const u2Match = path.match(/\/u2\/([^/]+)$/);
      if (u2Match && u2Match[1] !== "login" && u2Match[1] !== "screen") {
        return u2Match[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  private handleLinkClick = (
    e: MouseEvent,
    link: { id?: string; href: string; text: string },
  ) => {
    // Emit the event so the consuming app can handle it
    this.linkClick.emit({
      id: link.id,
      href: link.href,
      text: link.text,
    });

    // If autoNavigate is not enabled, prevent default and let the app decide
    if (!this.shouldAutoNavigate) {
      e.preventDefault();
      return;
    }

    // Try client-side navigation: extract screen ID and fetch via API
    const screenId = this.extractScreenIdFromHref(link.href);
    if (screenId && this.apiUrl) {
      e.preventDefault();
      this.navigateToScreen(screenId, link.href);
      return;
    }

    // Fall back to browser navigation for non-u2 links
  };

  /**
   * Navigate to a screen client-side by fetching it from the API.
   * Updates the widget state and browser URL without a full page reload.
   */
  private async navigateToScreen(screenId: string, displayUrl: string) {
    const success = await this.fetchScreen(screenId);

    if (success) {
      // Push browser history so back/forward works
      window.history.pushState(
        { screen: screenId, state: this.state },
        "",
        displayUrl,
      );
    } else {
      // On failure, fall back to hard navigation
      window.location.href = displayUrl;
    }
  }

  /**
   * Look up the href for a social provider from the current screen's SOCIAL components.
   * Returns the href if found (e.g. for passwordless connections), or null.
   */
  private getProviderHref(connectionName: string): string | null {
    if (!this._screen) return null;
    for (const comp of this._screen.components) {
      const c = comp as {
        type: string;
        config?: { provider_details?: { name: string; href?: string }[] };
      };
      if (c.type === "SOCIAL" && c.config?.provider_details) {
        const match = c.config.provider_details.find(
          (d) => d.name === connectionName,
        );
        if (match?.href) return match.href;
      }
    }
    return null;
  }

  /**
   * Check if a component is a social button.
   */
  private isSocialComponent(component: FormComponent): boolean {
    // Check the type property directly - FormComponent has a 'type' field
    // SocialField has type 'SOCIAL'
    return (component as { type: string }).type === "SOCIAL";
  }

  /**
   * Check if a component is a divider.
   */
  private isDividerComponent(component: FormComponent): boolean {
    return (component as { type: string }).type === "DIVIDER";
  }

  render() {
    const screen = this._screen;

    if (this.loading && !screen) {
      return (
        <div class="widget-container">
          <div class="loading-spinner" />
        </div>
      );
    }

    if (!screen) {
      return (
        <div class="widget-container">
          <div class="error-message">No screen configuration provided</div>
        </div>
      );
    }

    // Use the local screen variable for all rendering
    const screenErrors =
      screen.messages?.filter((m) => m.type === "error") || [];
    const screenSuccesses =
      screen.messages?.filter((m) => m.type === "success") || [];
    const allComponents = [...(screen.components ?? [])];
    const components = allComponents
      .filter((c) => c.visible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const hiddenComponents = allComponents.filter(
      (c) => c.visible === false,
    );

    // Separate social, divider, and field components for layout ordering
    const socialComponents = components.filter((c) =>
      this.isSocialComponent(c),
    );
    const fieldComponents = components.filter(
      (c) => !this.isSocialComponent(c) && !this.isDividerComponent(c),
    );
    const dividerComponent = components.find((c) => this.isDividerComponent(c));
    const hasDivider = !!dividerComponent;
    const dividerText =
      (dividerComponent as DividerComponent)?.config?.text || "Or";

    // Build dynamic exportparts for social buttons including provider-specific parts
    const getExportParts = (component: FormComponent): string => {
      const baseParts = [
        "social-buttons",
        "button",
        "button-secondary",
        "button-social",
        "button-social-content",
        "button-social-text",
        "button-social-subtitle",
        "social-icon",
      ];
      const config = component.config as { providers?: string[] } | undefined;
      const providers = config?.providers ?? [];
      const providerParts = providers.flatMap((p: string) => {
        const safe = p.replace(/[^a-zA-Z0-9-]/g, "-");
        return [
          `button-social-${safe}`,
          `button-social-content-${safe}`,
          `button-social-text-${safe}`,
          `button-social-subtitle-${safe}`,
          `social-icon-${safe}`,
        ];
      });
      return [...baseParts, ...providerParts].join(", ");
    };

    // Get logo URL from theme.widget (takes precedence) or branding
    const logoUrl = this._theme?.widget?.logo_url || this._branding?.logo_url;

    return (
      <div class="widget-container" part="container" data-authstack-container>
        <header class="widget-header" part="header">
          {logoUrl && (
            <div class="logo-wrapper" part="logo-wrapper">
              <img class="logo" part="logo" src={logoUrl} alt="Logo" />
            </div>
          )}

          {screen.title && (
            <h1
              class="title"
              part="title"
              innerHTML={sanitizeHtml(screen.title)}
            />
          )}

          {screen.description && (
            <p
              class="description"
              part="description"
              innerHTML={sanitizeHtml(screen.description)}
            />
          )}
        </header>

        <div class="widget-body" part="body">
          {screenErrors.map((err) => (
            <div
              class="message message-error"
              part="message message-error"
              key={err.id ?? err.text}
            >
              {err.text}
            </div>
          ))}

          {screenSuccesses.map((msg) => (
            <div
              class="message message-success"
              part="message message-success"
              key={msg.id ?? msg.text}
            >
              {msg.text}
            </div>
          ))}

          <form
            onSubmit={this.handleSubmit}
            action={screen.action}
            method={screen.method || "POST"}
            part="form"
          >
            {/* Hidden fields rendered as plain inputs for script access */}
            {hiddenComponents.map((c) => (
              <input
                type="hidden"
                name={c.id}
                id={c.id}
                key={c.id}
                value={this.formData[c.id] || ""}
              />
            ))}
            <div class="form-content">
              {/* Social buttons section - order controlled by CSS */}
              {socialComponents.length > 0 && (
                <div class="social-section" part="social-section">
                  {socialComponents.map((component) => (
                    <authhero-node
                      key={component.id}
                      component={component}
                      value={this.formData[component.id]}
                      onFieldChange={(
                        e: CustomEvent<{ id: string; value: string }>,
                      ) => this.handleInputChange(e.detail.id, e.detail.value)}
                      onButtonClick={(
                        e: CustomEvent<{
                          id: string;
                          type: string;
                          value?: string;
                        }>,
                      ) => this.handleButtonClick(e.detail)}
                      disabled={this.loading}
                      exportparts={getExportParts(component)}
                    />
                  ))}
                </div>
              )}

              {/* Divider between social and form fields */}
              {socialComponents.length > 0 &&
                fieldComponents.length > 0 &&
                hasDivider && (
                  <div class="divider" part="divider">
                    <span class="divider-text">{dividerText}</span>
                  </div>
                )}

              {/* Form fields section - order controlled by CSS */}
              <div class="fields-section" part="fields-section">
                {fieldComponents.map((component) => (
                  <authhero-node
                    key={component.id}
                    component={component}
                    value={this.formData[component.id]}
                    onFieldChange={(
                      e: CustomEvent<{ id: string; value: string }>,
                    ) => this.handleInputChange(e.detail.id, e.detail.value)}
                    onButtonClick={(
                      e: CustomEvent<{
                        id: string;
                        type: string;
                        value?: string;
                      }>,
                    ) => this.handleButtonClick(e.detail)}
                    disabled={this.loading}
                  />
                ))}
              </div>
            </div>
          </form>

          {screen.links && screen.links.length > 0 && (
            <div class="links" part="links">
              {screen.links.map((link) => (
                <span
                  class="link-wrapper"
                  part="link-wrapper"
                  key={link.id ?? link.href}
                >
                  {link.linkText ? (
                    <span>
                      {link.text}{" "}
                      <a
                        href={link.href}
                        class="link"
                        part="link"
                        onClick={(e) =>
                          this.handleLinkClick(e, {
                            id: link.id,
                            href: link.href,
                            text: link.linkText || link.text,
                          })
                        }
                      >
                        {link.linkText}
                      </a>
                    </span>
                  ) : (
                    <a
                      href={link.href}
                      class="link"
                      part="link"
                      onClick={(e) =>
                        this.handleLinkClick(e, {
                          id: link.id,
                          href: link.href,
                          text: link.text,
                        })
                      }
                    >
                      {link.text}
                    </a>
                  )}
                </span>
              ))}
            </div>
          )}

          {screen.footer && (
            <div
              class="widget-footer"
              part="footer"
              innerHTML={sanitizeHtml(screen.footer)}
            />
          )}
        </div>
      </div>
    );
  }
}
