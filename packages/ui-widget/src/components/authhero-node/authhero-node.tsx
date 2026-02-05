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

  /**
   * Sanitize a string for use in CSS class names and part tokens.
   * Replaces spaces and special characters with hyphens, converts to lowercase.
   */
  private sanitizeForCssToken(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric chars with hyphen
      .replace(/-+/g, "-") // Collapse multiple hyphens
      .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
  }

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
    const detailsMap = new Map(providerDetails?.map((d) => [d.name, d]) ?? []);

    // Get button text from provider_details (already contains the full button text from server)
    const getButtonText = (provider: string): string => {
      const details = detailsMap.get(provider);
      if (details?.display_name) {
        return details.display_name;
      }
      // Fallback: use provider name with basic formatting
      return provider
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    };

    // Get provider icon from provider_details icon_url
    const getProviderIcon = (provider: string) => {
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
      // No icon provided - return null (button will just show text)
      return null;
    };

    return (
      <div class="social-buttons" part="social-buttons">
        {providers.map((provider) => {
          const safeProvider = this.sanitizeForCssToken(provider);
          const icon = getProviderIcon(provider);
          return (
            <button
              type="button"
              class={`btn btn-secondary btn-social btn-social-${safeProvider}${icon ? "" : " no-icon"}`}
              part={`button button-secondary button-social button-social-${safeProvider}`}
              data-provider={provider}
              disabled={this.disabled}
              onClick={(e) => this.handleButtonClick(e, "SOCIAL", provider)}
              key={provider}
            >
              {icon}
              <span part="button-social-text">{getButtonText(provider)}</span>
            </button>
          );
        })}
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
