import { Component, h, Prop, Event, EventEmitter, State } from "@stencil/core";
import type {
  FormComponent,
  RuntimeComponent,
  ComponentMessage,
  BlockComponent,
  FieldComponent,
} from "../../types/components";

@Component({
  tag: "authhero-node",
  styleUrl: "authhero-node.css",
  shadow: true,
})
export class AuthheroNode {
  /**
   * The component configuration to render.
   * Follows Auth0 Forms component schema.
   */
  @Prop() component!: FormComponent | RuntimeComponent;

  /**
   * Current value for field components.
   */
  @Prop() value?: string;

  /**
   * Whether the component is disabled.
   */
  @Prop() disabled = false;

  /**
   * Whether the password field is visible.
   */
  @State() passwordVisible = false;

  /**
   * Emitted when a field value changes.
   */
  @Event() fieldChange!: EventEmitter<{ id: string; value: string }>;

  /**
   * Emitted when a button is clicked.
   */
  @Event() buttonClick!: EventEmitter<{
    id: string;
    type: string;
    value?: string;
  }>;

  private handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.fieldChange.emit({ id: this.component.id, value: target.value });
  };

  private handleCheckbox = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.fieldChange.emit({
      id: this.component.id,
      value: target.checked ? "true" : "false",
    });
  };

  private handleButtonClick = (e: Event, type: string, value?: string) => {
    if (type !== "submit") {
      e.preventDefault();
    }
    this.buttonClick.emit({ id: this.component.id, type, value });
  };

  private togglePasswordVisibility = () => {
    this.passwordVisible = !this.passwordVisible;
  };

  /**
   * Get error messages from the component.
   */
  private getErrors(): ComponentMessage[] {
    const runtimeComp = this.component as RuntimeComponent;
    return (
      runtimeComp.messages?.filter(
        (m: ComponentMessage) => m.type === "error",
      ) || []
    );
  }

  /**
   * Render a floating label for a field.
   */
  private renderFloatingLabel(
    text: string | undefined,
    inputId: string,
    required?: boolean,
    hasValue?: boolean,
  ) {
    if (!text) return null;
    return (
      <label
        class={{ "input-label": true, floating: !!hasValue }}
        part="label"
        htmlFor={inputId}
      >
        {text}
        {required && <span class="required">*</span>}
      </label>
    );
  }

  /**
   * Render a label for a field (non-floating version for checkboxes etc).
   */
  private renderLabel(
    text: string | undefined,
    inputId: string,
    required?: boolean,
  ) {
    if (!text) return null;
    return (
      <label class="input-label" part="label" htmlFor={inputId}>
        {text}
        {required && <span class="required">*</span>}
      </label>
    );
  }

  /**
   * Render the eye icon for password visibility toggle.
   */
  private renderPasswordToggle() {
    if (this.passwordVisible) {
      // Eye-off icon (password is visible, click to hide)
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      );
    }
    // Eye icon (password is hidden, click to show)
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    );
  }

  /**
   * Render error messages.
   */
  private renderErrors() {
    const errors = this.getErrors();
    return errors.map((err) => (
      <span class="error-text" part="error-text" key={err.id ?? err.text}>
        {err.text}
      </span>
    ));
  }

  /**
   * Render hint text.
   */
  private renderHint(hint: string | undefined) {
    if (!hint) return null;
    return (
      <span class="helper-text" part="helper-text">
        {hint}
      </span>
    );
  }

  // ===========================================================================
  // BLOCK Component Renderers
  // ===========================================================================

  private renderDivider() {
    return <hr class="divider" part="divider" />;
  }

  private renderHtml(component: BlockComponent & { type: "HTML" }) {
    return (
      <div
        class="html-content"
        part="html-content"
        innerHTML={component.config?.content ?? ""}
      />
    );
  }

  private renderImage(component: BlockComponent & { type: "IMAGE" }) {
    const { src, alt, width, height } = component.config ?? {};
    if (!src) return null;
    return (
      <img
        class="image"
        part="image"
        src={src}
        alt={alt ?? ""}
        width={width}
        height={height}
        loading="lazy"
      />
    );
  }

  private renderRichText(component: BlockComponent & { type: "RICH_TEXT" }) {
    return (
      <div
        class="rich-text"
        part="rich-text"
        innerHTML={component.config?.content ?? ""}
      />
    );
  }

  private renderNextButton(
    component: BlockComponent & { type: "NEXT_BUTTON" },
  ) {
    return (
      <button
        type="submit"
        class="btn btn-primary"
        part="button button-primary"
        disabled={this.disabled}
        onClick={(e) => this.handleButtonClick(e, "submit", "next")}
      >
        {component.config.text ?? "Continue"}
      </button>
    );
  }

  private renderPreviousButton(
    component: BlockComponent & { type: "PREVIOUS_BUTTON" },
  ) {
    return (
      <button
        type="button"
        class="btn btn-secondary"
        part="button button-secondary"
        disabled={this.disabled}
        onClick={(e) => this.handleButtonClick(e, "previous", "back")}
      >
        {component.config.text ?? "Back"}
      </button>
    );
  }

  private renderJumpButton(
    component: BlockComponent & { type: "JUMP_BUTTON" },
  ) {
    return (
      <button
        type="button"
        class="btn btn-link"
        part="button button-link"
        disabled={this.disabled}
        onClick={(e) =>
          this.handleButtonClick(e, "jump", component.config.target_step)
        }
      >
        {component.config.text ?? "Go"}
      </button>
    );
  }

  private renderResendButton(
    component: BlockComponent & { type: "RESEND_BUTTON" },
  ) {
    return (
      <button
        type="button"
        class="btn btn-link"
        part="button button-link"
        disabled={this.disabled}
        onClick={(e) =>
          this.handleButtonClick(e, "resend", component.config.resend_action)
        }
      >
        {component.config.text ?? "Resend"}
      </button>
    );
  }

  // ===========================================================================
  // FIELD Component Renderers
  // ===========================================================================

  private renderTextField(component: FieldComponent & { type: "TEXT" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const { multiline, max_length } = component.config ?? {};
    const hasValue = !!(this.value && this.value.length > 0);

    if (multiline) {
      return (
        <div class="input-wrapper" part="input-wrapper">
          {this.renderLabel(component.label, inputId, component.required)}
          <textarea
            id={inputId}
            class={{ "input-field": true, "has-error": errors.length > 0 }}
            part="input textarea"
            name={component.id}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            maxLength={max_length}
            onInput={this.handleInput}
          >
            {this.value ?? ""}
          </textarea>
          {this.renderErrors()}
          {errors.length === 0 && this.renderHint(component.hint)}
        </div>
      );
    }

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container">
          <input
            id={inputId}
            class={{ "input-field": true, "has-error": errors.length > 0 }}
            part="input"
            type={component.sensitive ? "password" : "text"}
            name={component.id}
            value={this.value ?? ""}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            maxLength={max_length}
            onInput={this.handleInput}
          />
          {this.renderFloatingLabel(
            component.label,
            inputId,
            component.required,
            hasValue,
          )}
        </div>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderEmailField(component: FieldComponent & { type: "EMAIL" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const hasValue = !!(this.value && this.value.length > 0);

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container">
          <input
            id={inputId}
            class={{ "input-field": true, "has-error": errors.length > 0 }}
            part="input"
            type="email"
            name={component.id}
            value={this.value ?? ""}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            autocomplete="email"
            onInput={this.handleInput}
          />
          {this.renderFloatingLabel(
            component.label,
            inputId,
            component.required,
            hasValue,
          )}
        </div>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderPasswordField(
    component: FieldComponent & { type: "PASSWORD" },
  ) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const hasValue = !!(this.value && this.value.length > 0);
    const forgotPasswordLink = component.config?.forgot_password_link;

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container password-container">
          <input
            id={inputId}
            class={{ "input-field": true, "has-error": errors.length > 0 }}
            part="input"
            type={this.passwordVisible ? "text" : "password"}
            name={component.id}
            value={this.value ?? ""}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            minLength={component.config?.min_length}
            autocomplete="current-password"
            onInput={this.handleInput}
          />
          {this.renderFloatingLabel(
            component.label,
            inputId,
            component.required,
            hasValue,
          )}
          <button
            type="button"
            class="password-toggle"
            part="password-toggle"
            onClick={this.togglePasswordVisibility}
            aria-label="Toggle password visibility"
            aria-pressed={this.passwordVisible ? "true" : "false"}
          >
            {this.renderPasswordToggle()}
          </button>
        </div>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
        {forgotPasswordLink && (
          <div class="field-link" part="field-link">
            <a href={forgotPasswordLink} class="link" part="link">
              Forgot password?
            </a>
          </div>
        )}
      </div>
    );
  }

  private renderNumberField(component: FieldComponent & { type: "NUMBER" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const { placeholder, min, max, step } = component.config ?? {};

    return (
      <div class="input-wrapper" part="input-wrapper">
        {this.renderLabel(component.label, inputId, component.required)}
        <input
          id={inputId}
          class={{ "input-field": true, "has-error": errors.length > 0 }}
          part="input"
          type="number"
          name={component.id}
          value={this.value ?? ""}
          placeholder={placeholder}
          required={component.required}
          disabled={this.disabled}
          min={min}
          max={max}
          step={step}
          onInput={this.handleInput}
        />
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderTelField(component: FieldComponent & { type: "TEL" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();

    return (
      <div class="input-wrapper" part="input-wrapper">
        {this.renderLabel(component.label, inputId, component.required)}
        <input
          id={inputId}
          class={{ "input-field": true, "has-error": errors.length > 0 }}
          part="input"
          type="tel"
          name={component.id}
          value={this.value ?? ""}
          placeholder={component.config?.placeholder}
          required={component.required}
          disabled={this.disabled}
          autocomplete="tel"
          onInput={this.handleInput}
        />
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderUrlField(component: FieldComponent & { type: "URL" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();

    return (
      <div class="input-wrapper" part="input-wrapper">
        {this.renderLabel(component.label, inputId, component.required)}
        <input
          id={inputId}
          class={{ "input-field": true, "has-error": errors.length > 0 }}
          part="input"
          type="url"
          name={component.id}
          value={this.value ?? ""}
          placeholder={component.config?.placeholder}
          required={component.required}
          disabled={this.disabled}
          onInput={this.handleInput}
        />
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderDateField(component: FieldComponent & { type: "DATE" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const { min, max } = component.config ?? {};

    return (
      <div class="input-wrapper" part="input-wrapper">
        {this.renderLabel(component.label, inputId, component.required)}
        <input
          id={inputId}
          class={{ "input-field": true, "has-error": errors.length > 0 }}
          part="input"
          type="date"
          name={component.id}
          value={this.value ?? ""}
          required={component.required}
          disabled={this.disabled}
          min={min}
          max={max}
          onInput={this.handleInput}
        />
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderBooleanField(component: FieldComponent & { type: "BOOLEAN" }) {
    return (
      <label class="checkbox-wrapper" part="checkbox-wrapper">
        <input
          type="checkbox"
          part="checkbox"
          name={component.id}
          checked={
            this.value === "true" || component.config?.default_value === true
          }
          required={component.required}
          disabled={this.disabled}
          onChange={this.handleCheckbox}
        />
        <span class="checkbox-label" part="checkbox-label">
          {component.label}
        </span>
      </label>
    );
  }

  private renderLegalField(component: FieldComponent & { type: "LEGAL" }) {
    const text = component.config?.text ?? component.label ?? "";
    const isHtml = component.config?.html === true;

    return (
      <label class="checkbox-wrapper" part="checkbox-wrapper">
        <input
          type="checkbox"
          part="checkbox"
          name={component.id}
          checked={this.value === "true"}
          required={component.required}
          disabled={this.disabled}
          onChange={this.handleCheckbox}
        />
        {isHtml ? (
          <span class="checkbox-label" part="checkbox-label" innerHTML={text} />
        ) : (
          <span class="checkbox-label" part="checkbox-label">
            {text}
          </span>
        )}
      </label>
    );
  }

  private renderDropdownField(
    component: FieldComponent & { type: "DROPDOWN" },
  ) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const { options, placeholder } = component.config ?? {};

    return (
      <div class="input-wrapper" part="input-wrapper">
        {this.renderLabel(component.label, inputId, component.required)}
        <select
          id={inputId}
          class={{ "input-field": true, "has-error": errors.length > 0 }}
          part="input select"
          name={component.id}
          required={component.required}
          disabled={this.disabled}
          onChange={this.handleInput}
        >
          {placeholder && (
            <option value="" disabled selected={!this.value}>
              {placeholder}
            </option>
          )}
          {options?.map((opt) => (
            <option
              value={opt.value}
              selected={this.value === opt.value}
              key={opt.value}
            >
              {opt.label}
            </option>
          ))}
        </select>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderChoiceField(component: FieldComponent & { type: "CHOICE" }) {
    const errors = this.getErrors();
    const { options, display } = component.config ?? {};
    const isCheckbox = display === "checkbox";
    const inputType = isCheckbox ? "checkbox" : "radio";

    return (
      <div class="choice-wrapper" part="choice-wrapper">
        {component.label && (
          <span class="choice-label" part="choice-label">
            {component.label}
            {component.required && <span class="required">*</span>}
          </span>
        )}
        <div class="choice-options" part="choice-options">
          {options?.map((opt) => (
            <label class="choice-option" part="choice-option" key={opt.value}>
              <input
                type={inputType}
                part={inputType}
                name={component.id}
                value={opt.value}
                checked={this.value === opt.value}
                required={component.required && !isCheckbox}
                disabled={this.disabled}
                onChange={this.handleInput}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderSocialField(component: FieldComponent & { type: "SOCIAL" }) {
    const providers = component.config?.providers ?? [];
    const providerDetails = (
      component.config as {
        providers?: string[];
        provider_details?: {
          name: string;
          strategy?: string;
          display_name?: string;
          icon_url?: string;
        }[];
      }
    )?.provider_details;

    // Create a map of provider details for quick lookup
    const detailsMap = new Map(
      providerDetails?.map((d) => [d.name, d]) ?? [],
    );

    // Known provider identifiers for icon matching
    const knownProviders = [
      "google-oauth2",
      "google",
      "facebook",
      "apple",
      "github",
      "microsoft",
      "windowslive",
      "linkedin",
      "vipps",
    ];

    // Find matching known provider from name or strategy
    const findKnownProvider = (
      name: string,
      strategy?: string,
    ): string | null => {
      const nameLower = name.toLowerCase();
      const strategyLower = strategy?.toLowerCase();

      // First check exact match on strategy
      if (strategyLower && knownProviders.includes(strategyLower)) {
        return strategyLower;
      }

      // Then check exact match on name
      if (knownProviders.includes(nameLower)) {
        return nameLower;
      }

      // Check if name contains a known provider (e.g., "Vipps Login" contains "vipps")
      for (const known of knownProviders) {
        if (nameLower.includes(known)) {
          return known;
        }
      }

      return null;
    };

    // Map provider IDs to display names
    const getProviderDisplayName = (provider: string): string => {
      // First check provider_details
      const details = detailsMap.get(provider);
      if (details?.display_name) {
        return details.display_name;
      }

      const displayNames: Record<string, string> = {
        "google-oauth2": "Google",
        facebook: "Facebook",
        twitter: "Twitter",
        github: "GitHub",
        linkedin: "LinkedIn",
        apple: "Apple",
        microsoft: "Microsoft",
        windowslive: "Microsoft",
        amazon: "Amazon",
        dropbox: "Dropbox",
        bitbucket: "Bitbucket",
        spotify: "Spotify",
        slack: "Slack",
        discord: "Discord",
        twitch: "Twitch",
        line: "LINE",
        shopify: "Shopify",
        paypal: "PayPal",
        "paypal-sandbox": "PayPal",
        box: "Box",
        salesforce: "Salesforce",
        "salesforce-sandbox": "Salesforce",
        yahoo: "Yahoo",
        auth0: "Auth0",
        vipps: "Vipps",
      };
      return (
        displayNames[provider.toLowerCase()] ||
        provider
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      );
    };

    // Get provider icon - either from provider_details or built-in SVG
    const getProviderIcon = (provider: string) => {
      // First check if we have a custom icon URL from provider_details
      const details = detailsMap.get(provider);
      if (details?.icon_url) {
        return (
          <img
            class="social-icon"
            src={details.icon_url}
            alt={details.display_name || provider}
          />
        );
      }

      // Try to find a known provider from name or strategy
      const knownProvider = findKnownProvider(provider, details?.strategy);
      const p = knownProvider || provider.toLowerCase();

      if (p === "google-oauth2" || p === "google") {
        return (
          <svg
            class="social-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        );
      }
      if (p === "facebook") {
        return (
          <svg
            class="social-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
              fill="#1877F2"
            />
          </svg>
        );
      }
      if (p === "apple") {
        return (
          <svg
            class="social-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
              fill="#000000"
            />
          </svg>
        );
      }
      if (p === "github") {
        return (
          <svg
            class="social-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
              fill="#181717"
            />
          </svg>
        );
      }
      if (p === "microsoft" || p === "windowslive") {
        return (
          <svg
            class="social-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M0 0h11.377v11.372H0V0z" fill="#f25022" />
            <path d="M12.623 0H24v11.372H12.623V0z" fill="#7fba00" />
            <path d="M0 12.623h11.377V24H0v-11.377z" fill="#00a4ef" />
            <path d="M12.623 12.623H24V24H12.623v-11.377z" fill="#ffb900" />
          </svg>
        );
      }
      if (p === "linkedin") {
        return (
          <svg
            class="social-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
              fill="#0A66C2"
            />
          </svg>
        );
      }
      if (p === "vipps") {
        return (
          <svg
            class="social-icon"
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="#FF5B24"
              d="M3.5,8h41c1.9,0,3.5,1.6,3.5,3.5v25c0,1.9-1.6,3.5-3.5,3.5h-41C1.6,40,0,38.4,0,36.5v-25C0,9.6,1.6,8,3.5,8z"
            />
            <path
              fill="#FFFFFF"
              d="M27.9,20.3c1.4,0,2.6-1,2.6-2.5c0-1.5-1.2-2.5-2.6-2.5c-1.4,0-2.6,1-2.6,2.5C25.3,19.2,26.5,20.3,27.9,20.3z"
            />
            <path
              fill="#FFFFFF"
              d="M31.2,24.4c-1.7,2.2-3.5,3.8-6.7,3.8c-3.2,0-5.8-2-7.7-4.8c-0.8-1.2-2-1.4-2.9-0.8c-0.8,0.6-1,1.8-0.3,2.9c2.7,4.1,6.5,6.6,10.9,6.6c4,0,7.2-2,9.6-5.2c0.9-1.2,0.9-2.5,0-3.1C33.3,22.9,32.1,23.2,31.2,24.4z"
            />
          </svg>
        );
      }
      // Default: generic globe icon for unknown providers
      return (
        <svg
          class="social-icon"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="#666"
            stroke-width="2"
          />
          <path
            d="M2 12h20M12 2c-2.5 2.5-4 5.5-4 10s1.5 7.5 4 10c2.5-2.5 4-5.5 4-10s-1.5-7.5-4-10z"
            fill="none"
            stroke="#666"
            stroke-width="2"
          />
        </svg>
      );
    };

    return (
      <div class="social-buttons" part="social-buttons">
        {providers.map((provider) => (
          <button
            type="button"
            class="btn btn-secondary btn-social"
            part="button button-secondary button-social"
            data-provider={provider}
            disabled={this.disabled}
            onClick={(e) => this.handleButtonClick(e, "SOCIAL", provider)}
            key={provider}
          >
            {getProviderIcon(provider)}
            <span>Continue with {getProviderDisplayName(provider)}</span>
          </button>
        ))}
      </div>
    );
  }

  // ===========================================================================
  // Main Render
  // ===========================================================================

  render() {
    if (!this.component) {
      return null;
    }

    // Hidden components
    if (this.component.visible === false) {
      return null;
    }

    switch (this.component.type) {
      // BLOCK components
      case "DIVIDER":
        return this.renderDivider();
      case "HTML":
        return this.renderHtml(
          this.component as BlockComponent & { type: "HTML" },
        );
      case "IMAGE":
        return this.renderImage(
          this.component as BlockComponent & { type: "IMAGE" },
        );
      case "RICH_TEXT":
        return this.renderRichText(
          this.component as BlockComponent & { type: "RICH_TEXT" },
        );
      case "NEXT_BUTTON":
        return this.renderNextButton(
          this.component as BlockComponent & { type: "NEXT_BUTTON" },
        );
      case "PREVIOUS_BUTTON":
        return this.renderPreviousButton(
          this.component as BlockComponent & { type: "PREVIOUS_BUTTON" },
        );
      case "JUMP_BUTTON":
        return this.renderJumpButton(
          this.component as BlockComponent & { type: "JUMP_BUTTON" },
        );
      case "RESEND_BUTTON":
        return this.renderResendButton(
          this.component as BlockComponent & { type: "RESEND_BUTTON" },
        );

      // FIELD components
      case "TEXT":
        return this.renderTextField(
          this.component as FieldComponent & { type: "TEXT" },
        );
      case "EMAIL":
        return this.renderEmailField(
          this.component as FieldComponent & { type: "EMAIL" },
        );
      case "PASSWORD":
        return this.renderPasswordField(
          this.component as FieldComponent & { type: "PASSWORD" },
        );
      case "NUMBER":
        return this.renderNumberField(
          this.component as FieldComponent & { type: "NUMBER" },
        );
      case "TEL":
        return this.renderTelField(
          this.component as FieldComponent & { type: "TEL" },
        );
      case "URL":
        return this.renderUrlField(
          this.component as FieldComponent & { type: "URL" },
        );
      case "DATE":
        return this.renderDateField(
          this.component as FieldComponent & { type: "DATE" },
        );
      case "BOOLEAN":
        return this.renderBooleanField(
          this.component as FieldComponent & { type: "BOOLEAN" },
        );
      case "LEGAL":
        return this.renderLegalField(
          this.component as FieldComponent & { type: "LEGAL" },
        );
      case "DROPDOWN":
        return this.renderDropdownField(
          this.component as FieldComponent & { type: "DROPDOWN" },
        );
      case "CHOICE":
        return this.renderChoiceField(
          this.component as FieldComponent & { type: "CHOICE" },
        );
      case "SOCIAL":
        return this.renderSocialField(
          this.component as FieldComponent & { type: "SOCIAL" },
        );

      // WIDGET components (not yet implemented)
      case "AUTH0_VERIFIABLE_CREDENTIALS":
      case "GMAPS_ADDRESS":
      case "RECAPTCHA":
        console.warn(
          `Widget component "${this.component.type}" not yet implemented`,
        );
        return null;

      // Other FIELD components (not yet implemented)
      case "CARDS":
      case "CUSTOM":
      case "FILE":
      case "PAYMENT":
        console.warn(`Component "${this.component.type}" not yet implemented`);
        return null;

      default:
        console.warn(
          `Unknown component type: ${(this.component as FormComponent).type}`,
        );
        return null;
    }
  }
}
