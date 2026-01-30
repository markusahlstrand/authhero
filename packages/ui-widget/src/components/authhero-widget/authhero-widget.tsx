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
  ComponentMessage,
} from "../../types/components";
import type { WidgetBranding, WidgetTheme } from "../../utils/branding";
import { mergeThemeVars, applyCssVars } from "../../utils/branding";

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
      this.screenChange.emit(this._screen);
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

  async componentWillLoad() {
    // Parse initial props
    this.watchScreen(this.screen);
    this.watchBranding(this.branding);
    this.watchTheme(this.theme);
    this.watchAuthParams(this.authParams);

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
  async fetchScreen(screenIdOverride?: string, nodeId?: string) {
    if (!this.apiUrl) return;

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
          this.screenChange.emit(this._screen);
          this.persistState();
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
  }

  private handleInputChange = (name: string, value: string) => {
    this.formData = {
      ...this.formData,
      [name]: value,
    };
  };

  private handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!this._screen) return;

    // Always emit the submit event
    this.formSubmit.emit({
      screen: this._screen,
      data: this.formData,
    });

    // If autoSubmit is disabled, let the consuming app handle it
    if (!this.autoSubmit) {
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
        body: JSON.stringify({ data: this.formData }),
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
        } else if (result.screen) {
          // Next screen
          this._screen = result.screen;
          this.formData = {};
          this.screenChange.emit(result.screen);

          // Update screenId if returned in response
          if (result.screenId) {
            this.screenId = result.screenId;
          }
          this.persistState();

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
        } else if (result.complete) {
          // Flow complete without redirect
          this.flowComplete.emit({});
        }

        // Handle validation errors (400 response)
        if (!response.ok && result.screen) {
          this._screen = result.screen;
          this.screenChange.emit(result.screen);
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

  private handleButtonClick = (detail: ButtonClickEventDetail) => {
    // If this is a submit button click, trigger form submission
    if (detail.type === "submit") {
      // Create a synthetic submit event and call handleSubmit
      const syntheticEvent = { preventDefault: () => {} } as Event;
      this.handleSubmit(syntheticEvent);
      return;
    }

    // Always emit the event
    this.buttonClick.emit(detail);

    // Handle social login if autoNavigate is enabled
    if (detail.type === "SOCIAL" && detail.value && this.shouldAutoNavigate) {
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

    // If autoNavigate is enabled, let the browser handle the navigation
    // Otherwise, prevent default and let the app decide
    if (!this.shouldAutoNavigate) {
      e.preventDefault();
    }
  };

  /**
   * Get error messages from the screen-level messages array.
   */
  private getScreenErrors(): ComponentMessage[] {
    return this._screen?.messages?.filter((m) => m.type === "error") || [];
  }

  /**
   * Get success messages from the screen-level messages array.
   */
  private getScreenSuccesses(): ComponentMessage[] {
    return this._screen?.messages?.filter((m) => m.type === "success") || [];
  }

  /**
   * Sort components by order.
   */
  private getOrderedComponents(): FormComponent[] {
    if (!this._screen) return [];

    return [...this._screen.components]
      .filter((c) => c.visible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
    if (this.loading && !this._screen) {
      return (
        <div class="widget-container">
          <div class="loading-spinner" />
        </div>
      );
    }

    if (!this._screen) {
      return (
        <div class="widget-container">
          <div class="error-message">No screen configuration provided</div>
        </div>
      );
    }

    const screenErrors = this.getScreenErrors();
    const screenSuccesses = this.getScreenSuccesses();
    const components = this.getOrderedComponents();

    // Separate social, divider, and field components for layout ordering
    const socialComponents = components.filter((c) =>
      this.isSocialComponent(c),
    );
    const fieldComponents = components.filter(
      (c) => !this.isSocialComponent(c) && !this.isDividerComponent(c),
    );
    const hasDivider = components.some((c) => this.isDividerComponent(c));

    // Get logo URL from theme.widget (takes precedence) or branding
    const logoUrl = this._theme?.widget?.logo_url || this._branding?.logo_url;

    return (
      <div class="widget-container" part="container">
        <header class="widget-header" part="header">
          {logoUrl && (
            <div class="logo-wrapper" part="logo-wrapper">
              <img class="logo" part="logo" src={logoUrl} alt="Logo" />
            </div>
          )}

          {this._screen.title && (
            <h1 class="title" part="title">
              {this._screen.title}
            </h1>
          )}

          {this._screen.description && (
            <p class="description" part="description">
              {this._screen.description}
            </p>
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

          <form onSubmit={this.handleSubmit} part="form">
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
                    />
                  ))}
                </div>
              )}

              {/* Divider between social and form fields */}
              {socialComponents.length > 0 &&
                fieldComponents.length > 0 &&
                hasDivider && (
                  <div class="divider" part="divider">
                    <span class="divider-text">Or</span>
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

          {this._screen.links && this._screen.links.length > 0 && (
            <div class="links" part="links">
              {this._screen.links.map((link) => (
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
        </div>
      </div>
    );
  }
}
