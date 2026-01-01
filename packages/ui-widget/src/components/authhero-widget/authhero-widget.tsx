import { Component, h, Prop, State, Event, EventEmitter, Watch, Element } from '@stencil/core';
import type { UiScreen, FormComponent, ComponentMessage } from '../../types/components';
import type { WidgetBranding, WidgetTheme } from '../../utils/branding';
import { mergeThemeVars, applyCssVars } from '../../utils/branding';

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

@Component({
  tag: 'authhero-widget',
  styleUrl: 'authhero-widget.css',
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
   */
  @Prop() apiUrl?: string;

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
   * Internal parsed screen state.
   */
  @State() _screen?: UiScreen;

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

  @Watch('screen')
  watchScreen(newValue: UiScreen | string | undefined) {
    if (typeof newValue === 'string') {
      try {
        this._screen = JSON.parse(newValue);
      } catch {
        console.error('Failed to parse screen JSON');
      }
    } else {
      this._screen = newValue;
    }
    if (this._screen) {
      this.screenChange.emit(this._screen);
    }
  }

  @Watch('branding')
  watchBranding(newValue: WidgetBranding | string | undefined) {
    if (typeof newValue === 'string') {
      try {
        this._branding = JSON.parse(newValue);
      } catch {
        console.error('Failed to parse branding JSON');
      }
    } else {
      this._branding = newValue;
    }
    this.applyThemeStyles();
  }

  @Watch('theme')
  watchTheme(newValue: WidgetTheme | string | undefined) {
    if (typeof newValue === 'string') {
      try {
        this._theme = JSON.parse(newValue);
      } catch {
        console.error('Failed to parse theme JSON');
      }
    } else {
      this._theme = newValue;
    }
    this.applyThemeStyles();
  }

  /**
   * Apply branding and theme as CSS custom properties
   */
  private applyThemeStyles() {
    const vars = mergeThemeVars(this._branding, this._theme);
    applyCssVars(this.el, vars);
  }

  async componentWillLoad() {
    // Parse initial props
    this.watchScreen(this.screen);
    this.watchBranding(this.branding);
    this.watchTheme(this.theme);

    // Fetch screen from API if URL provided and no screen prop
    if (this.apiUrl && !this._screen) {
      await this.fetchScreen();
    }
  }

  private async fetchScreen() {
    if (!this.apiUrl) return;

    this.loading = true;
    try {
      const response = await fetch(this.apiUrl, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
      if (response.ok) {
        this._screen = await response.json();
        if (this._screen) {
          this.screenChange.emit(this._screen);
        }
      }
    } catch (error) {
      console.error('Failed to fetch screen:', error);
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
      const response = await fetch(this._screen.action, {
        method: this._screen.method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ data: this.formData }),
      });

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const result = await response.json();

        // Handle different response types
        if (result.redirect) {
          // Auth complete - emit complete event
          this.flowComplete.emit({ redirectUrl: result.redirect });
          // Also emit navigate for backwards compatibility
          this.navigate.emit({ url: result.redirect });
        } else if (result.screen) {
          // Next screen
          this._screen = result.screen;
          this.formData = {};
          this.screenChange.emit(result.screen);

          // Apply branding if included
          if (result.branding) {
            this._branding = result.branding;
            this.applyThemeStyles();
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
      console.error('Form submission failed:', err);
      this.flowError.emit({
        message: err instanceof Error ? err.message : 'Form submission failed',
      });
    } finally {
      this.loading = false;
    }
  };

  private handleButtonClick = (detail: ButtonClickEventDetail) => {
    this.buttonClick.emit(detail);
  };

  private handleLinkClick = (e: MouseEvent, link: { id?: string; href: string; text: string }) => {
    // Emit the event so the consuming app can handle it
    this.linkClick.emit({
      id: link.id,
      href: link.href,
      text: link.text,
    });

    // If autoSubmit is enabled, let the browser handle the navigation
    // Otherwise, prevent default and let the app decide
    if (!this.autoSubmit) {
      e.preventDefault();
    }
  };

  /**
   * Get error messages from the screen-level messages array.
   */
  private getScreenErrors(): ComponentMessage[] {
    return this._screen?.messages?.filter((m) => m.type === 'error') || [];
  }

  /**
   * Get success messages from the screen-level messages array.
   */
  private getScreenSuccesses(): ComponentMessage[] {
    return this._screen?.messages?.filter((m) => m.type === 'success') || [];
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

    // Get logo URL from branding props
    const logoUrl = this._branding?.logo_url;

    return (
      <div class="widget-container" part="container">
        {logoUrl && <img class="logo" part="logo" src={logoUrl} alt="Logo" />}

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

        {screenErrors.map((err) => (
          <div class="message message-error" part="message message-error" key={err.id ?? err.text}>
            {err.text}
          </div>
        ))}

        {screenSuccesses.map((msg) => (
          <div class="message message-success" part="message message-success" key={msg.id ?? msg.text}>
            {msg.text}
          </div>
        ))}

        <form onSubmit={this.handleSubmit} part="form">
          {components.map((component) => (
            <authhero-node
              key={component.id}
              component={component}
              value={this.formData[component.id]}
              onFieldChange={(e: CustomEvent<{ id: string; value: string }>) =>
                this.handleInputChange(e.detail.id, e.detail.value)
              }
              onButtonClick={(e: CustomEvent<{ id: string; type: string; value?: string }>) =>
                this.handleButtonClick(e.detail)
              }
              disabled={this.loading}
            />
          ))}
        </form>

        {this._screen.links && this._screen.links.length > 0 && (
          <div class="links" part="links">
            {this._screen.links.map((link) => (
              <span class="link-wrapper" part="link-wrapper" key={link.id ?? link.href}>
                {link.linkText ? (
                  <span>
                    {link.text}{' '}
                    <a
                      href={link.href}
                      class="link"
                      part="link"
                      onClick={(e) => this.handleLinkClick(e, { id: link.id, href: link.href, text: link.linkText || link.text })}
                    >
                      {link.linkText}
                    </a>
                  </span>
                ) : (
                  <a
                    href={link.href}
                    class="link"
                    part="link"
                    onClick={(e) => this.handleLinkClick(e, { id: link.id, href: link.href, text: link.text })}
                  >
                    {link.text}
                  </a>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
}
