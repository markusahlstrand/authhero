import {
  Component,
  h,
  Prop,
  Event,
  EventEmitter,
  State,
  Watch,
  Element,
} from "@stencil/core";
import type {
  FormComponent,
  RuntimeComponent,
  ComponentMessage,
  BlockComponent,
  FieldComponent,
} from "../../types/components";
import {
  countries,
  getCountryByCode,
  type CountryData,
} from "../../utils/country-data";
import {
  expandTwoDigitYear,
  getDateLayout,
  parseIsoDate,
  resolveYearAnchor,
  toIsoDate,
  type DateSegment,
} from "../../utils/date-format";

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
  @Element() host!: HTMLElement;

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
   * BCP-47 locale used for locale-dependent field layout (currently the
   * segment order of DATE fields). Resolved server-side so SSR and hydration
   * agree; falls back to day-month-year when absent.
   */
  @Prop() locale?: string;

  /**
   * Whether the password field is visible.
   */
  @State() passwordVisible = false;

  /**
   * Selected country for TEL input with country selector.
   */
  @State() selectedCountry: CountryData = getCountryByCode("US");

  /**
   * Local phone number (without dial code) for TEL input.
   */
  @State() localPhoneNumber = "";

  /**
   * Whether the country dropdown is open.
   */
  @State() countryDropdownOpen = false;

  /**
   * Whether the TEL field is currently in email mode (allow_email config).
   * When true, the value is emitted as-is without dial code prefix.
   */
  @State() telEmailMode = false;

  /**
   * Segment values for the DATE input, each held as typed (unpadded while the
   * user is mid-entry) and normalised on blur.
   */
  @State() dateSegments: Record<DateSegment, string> = {
    year: "",
    month: "",
    day: "",
  };

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

  @Watch("component")
  componentChanged() {
    this.initCountryFromConfig();
    this.initTelValue();
    this.initDateValue();
  }

  @Watch("value")
  valueChanged() {
    this.initTelValue();
    this.initDateValue();
  }

  componentWillLoad() {
    this.initCountryFromConfig();
    this.initTelValue();
    this.initDateValue();
  }

  componentDidLoad() {
    // Auto-focus a code field so the caret starts in the first (leftmost) box.
    if (this.component?.type === "CODE" && !this.disabled) {
      const value = this.getEffectiveValue() ?? "";
      if (value.length === 0) {
        const input = this.host.shadowRoot?.querySelector(
          "input.code-input",
        ) as HTMLInputElement | null;
        input?.focus();
      }
    }
  }

  private initCountryFromConfig() {
    if (this.component?.type === "TEL") {
      const config = (this.component as FieldComponent).config as
        | Record<string, unknown>
        | undefined;
      const defaultCountry = config?.default_country as string | undefined;
      if (defaultCountry) {
        this.selectedCountry = getCountryByCode(defaultCountry);
      }
      // For allow_email mode, start in email/text mode (no country picker)
      // until the user starts typing digits
      if (config?.allow_email === true) {
        this.telEmailMode = true;
      }
    }
  }

  /**
   * The last value this field emitted for a TEL component. The widget mirrors
   * every emitted value back onto the `value` prop, and that echo must not be
   * re-parsed: the wire format carries only a dial code, so a country picked
   * from the list would be replaced by the first entry sharing that code — a
   * user who chose Canada would be silently moved to the US on their next
   * keystroke.
   */
  private lastEmittedTel?: string;

  /** Emit a TEL value and remember it, so the echo can be recognised. */
  private emitTelValue(value: string) {
    this.lastEmittedTel = value;
    this.fieldChange.emit({ id: this.component.id, value });
  }

  /**
   * Hydrate localPhoneNumber (and selectedCountry) from the effective value
   * for TEL fields. The full value is stored as `{dialCode}{localNumber}`,
   * e.g. "+15551234567".
   */
  private initTelValue() {
    if (this.component?.type !== "TEL") return;

    if (
      this.lastEmittedTel !== undefined &&
      this.getEffectiveValue() === this.lastEmittedTel
    ) {
      return;
    }

    const config = (this.component as FieldComponent).config as
      | Record<string, unknown>
      | undefined;
    const allowEmail = config?.allow_email === true;

    const fullValue = this.getEffectiveValue();
    if (!fullValue) {
      this.localPhoneNumber = "";
      if (allowEmail) {
        this.telEmailMode = true;
      }
      return;
    }

    // Try to match a country by dial code (longest match first)
    if (fullValue.startsWith("+")) {
      const sorted = [...countries].sort(
        (a, b) => b.dialCode.length - a.dialCode.length,
      );
      for (const country of sorted) {
        if (fullValue.startsWith(country.dialCode)) {
          this.selectedCountry = country;
          this.localPhoneNumber = fullValue.slice(country.dialCode.length);
          if (allowEmail) {
            this.telEmailMode = false;
          }
          return;
        }
      }
    }

    // No dial code match — check if it looks like an email or a phone number
    this.localPhoneNumber = fullValue;
    if (allowEmail) {
      const looksLikePhone = /^[+\d]/.test(fullValue);
      this.telEmailMode = !looksLikePhone;
    }
  }

  private handleCountryChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    this.selectedCountry = getCountryByCode(target.value);
    // A half-typed "+xx" prefix is replaced by the picked country, not kept
    // as a local number (it would emit "+46+4").
    if (this.localPhoneNumber.startsWith("+")) {
      this.localPhoneNumber = "";
    }
    // Re-emit the full phone number with new dial code
    const fullNumber = this.localPhoneNumber
      ? `${this.selectedCountry.dialCode}${this.localPhoneNumber}`
      : "";
    this.emitTelValue(fullNumber);
  };

  /**
   * Try to detect a dial code prefix in the raw input (e.g. "+46", "0046")
   * and update selectedCountry accordingly. Returns the local number portion
   * (after the dial code) if a match was found, or null if no match.
   */
  private detectDialCodeFromInput(raw: string): string | null {
    // Normalise "00" international prefix to "+"
    const normalized = raw.startsWith("00") ? "+" + raw.slice(2) : raw;
    if (!normalized.startsWith("+")) return null;

    // Match longest dial code first
    const sorted = [...countries].sort(
      (a, b) => b.dialCode.length - a.dialCode.length,
    );
    for (const country of sorted) {
      if (normalized.startsWith(country.dialCode)) {
        this.selectedCountry = country;
        return normalized.slice(country.dialCode.length);
      }
    }
    return null;
  }

  /**
   * Shared phone-input cleaning logic. Detects dial codes, strips non-phone
   * characters, updates the input value, and emits the full number.
   * @param allowPlus When true, uses a two-pass clean that first keeps '+'
   *   then strips it (for combined tel+email fields). When false, strips '+'
   *   in a single pass (phone-only fields where the picker provides the prefix).
   */
  private processPhoneInput(
    target: HTMLInputElement,
    value: string,
    allowPlus: boolean,
  ): void {
    const dialLocal = this.detectDialCodeFromInput(value);
    if (dialLocal !== null) {
      const cleanedLocal = allowPlus
        ? dialLocal.replace(/[^+\d\s\-()]/g, "").replace(/\+/g, "")
        : dialLocal.replace(/[^\d\s\-()]/g, "");
      target.value = cleanedLocal;
      this.localPhoneNumber = cleanedLocal;
      const fullNumber = `${this.selectedCountry.dialCode}${cleanedLocal}`;
      this.emitTelValue(fullNumber);
    } else if (value.startsWith("+")) {
      // A leading "+" is an international prefix the user is still typing.
      // Keep it in the field so the dial code can build up until it matches
      // a country — stripping it per keystroke means "+46" never resolves to
      // Sweden, since each character is discarded before the next arrives.
      const cleaned = `+${value.slice(1).replace(/[^\d\s\-()]/g, "")}`;
      if (cleaned !== value) {
        target.value = cleaned;
      }
      this.localPhoneNumber = cleaned;
      // Emit the partial prefix as-is; prefixing it with the (not yet chosen)
      // country's dial code would produce nonsense like "+1+4".
      this.emitTelValue(cleaned);
    } else {
      const cleaned = allowPlus
        ? value.replace(/[^+\d\s\-()]/g, "").replace(/\+/g, "")
        : value.replace(/[^\d\s\-()]/g, "");
      if (cleaned !== value) {
        target.value = cleaned;
      }
      this.localPhoneNumber = cleaned;
      const fullNumber = cleaned
        ? `${this.selectedCountry.dialCode}${cleaned}`
        : "";
      this.emitTelValue(fullNumber);
    }
  }

  private handlePhoneInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    const config = (this.component as FieldComponent).config as
      | Record<string, unknown>
      | undefined;
    const allowEmail = config?.allow_email === true;

    if (allowEmail) {
      // Detect phone mode: value starts with digit or '+', and no '@'.
      // When the field is empty, revert to neutral (email) mode so the
      // country picker disappears and the user can start fresh.
      const looksLikePhone =
        value.length > 0 && /^[+\d]/.test(value) && !value.includes("@");
      this.telEmailMode = !looksLikePhone;

      if (!this.telEmailMode) {
        this.processPhoneInput(target, value, true);
      } else {
        // Email or text — emit as-is
        this.localPhoneNumber = value;
        this.emitTelValue(value);
      }
      return;
    }

    // Standard phone-only mode
    this.processPhoneInput(target, value, false);
  };

  private handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.fieldChange.emit({ id: this.component.id, value: target.value });
  };

  // ===========================================================================
  // DATE segment handling
  // ===========================================================================

  /**
   * The last ISO value this field emitted. The widget mirrors every emitted
   * value back onto the `value` prop, and that echo must not be treated as an
   * external change: it would re-format the segments under the caret while
   * the user is still typing (a day of "3" comes back as "03", swallowing the
   * next digit).
   */
  private lastEmittedDate?: string;

  /** Hydrate the day/month/year segments from the effective ISO value. */
  private initDateValue() {
    if (this.component?.type !== "DATE") return;

    if (
      this.lastEmittedDate !== undefined &&
      this.getEffectiveValue() === this.lastEmittedDate
    ) {
      return;
    }

    const parsed = parseIsoDate(this.getEffectiveValue());
    if (parsed) {
      this.dateSegments = parsed;
      return;
    }

    // No parseable value. Only clear when we currently hold a complete date,
    // i.e. this is a genuine external reset: a half-typed date emits "" and
    // the parent echoes that straight back as the value prop, which would
    // otherwise wipe the segment the user just typed into.
    if (toIsoDate(this.dateSegments) !== "") {
      this.dateSegments = { year: "", month: "", day: "" };
    }
  }

  private dateConfig(): Record<string, unknown> | undefined {
    return (this.component as FieldComponent).config as
      | Record<string, unknown>
      | undefined;
  }

  private getDateLayoutForField() {
    const config = this.dateConfig();
    return getDateLayout(config?.format as string | undefined, this.locale);
  }

  private static readonly SEGMENT_LENGTH: Record<DateSegment, number> = {
    day: 2,
    month: 2,
    year: 4,
  };

  /** Birthdate autofill tokens — the common case for a typed date. */
  private static readonly SEGMENT_AUTOCOMPLETE: Record<DateSegment, string> = {
    day: "bday-day",
    month: "bday-month",
    year: "bday-year",
  };

  /**
   * The submittable value for the current segments: an ISO date, or "" when
   * it is incomplete, impossible, or outside the field's `min`/`max`. ISO
   * strings compare chronologically, so the bounds need no parsing.
   */
  private dateIsoValue(segments: Record<DateSegment, string>): string {
    const iso = toIsoDate(segments);
    if (!iso) return "";

    const config = this.dateConfig();
    const min = config?.min;
    const max = config?.max;
    if (typeof min === "string" && parseIsoDate(min) && iso < min) return "";
    if (typeof max === "string" && parseIsoDate(max) && iso > max) return "";
    return iso;
  }

  private setDateSegments(segments: Record<DateSegment, string>) {
    this.dateSegments = segments;
    this.lastEmittedDate = this.dateIsoValue(segments);
    this.fieldChange.emit({
      id: this.component.id,
      value: this.lastEmittedDate,
    });
  }

  private focusDateSegment(segment: DateSegment) {
    const input = this.host.shadowRoot?.querySelector(
      `input[data-date-segment="${segment}"]`,
    ) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  /**
   * Whether typing this digit completes the segment. A segment is complete at
   * its full width, and also as soon as a further digit could not produce a
   * valid number — no day starts with 4 and no month starts with 2.
   */
  private isDateSegmentComplete(segment: DateSegment, value: string): boolean {
    if (value.length >= AuthheroNode.SEGMENT_LENGTH[segment]) return true;
    if (value.length !== 1) return false;
    if (segment === "day") return Number(value) > 3;
    if (segment === "month") return Number(value) > 1;
    return false;
  }

  private handleDateSegmentInput = (segment: DateSegment) => (e: Event) => {
    const target = e.target as HTMLInputElement;
    const digits = target.value
      .replace(/\D/g, "")
      .slice(0, AuthheroNode.SEGMENT_LENGTH[segment]);
    if (digits !== target.value) {
      target.value = digits;
    }

    this.setDateSegments({ ...this.dateSegments, [segment]: digits });

    if (this.isDateSegmentComplete(segment, digits)) {
      const order = this.getDateLayoutForField().order;
      const next = order[order.indexOf(segment) + 1];
      if (next) this.focusDateSegment(next);
    }
  };

  /**
   * Pad a single digit ("5" -> "05") and expand a two-digit year against the
   * field's upper bound ("85" -> 1985). Shared by blur and paste so a pasted
   * date is read the same way as a typed one.
   */
  private normalizeDateSegment(segment: DateSegment, value: string): string {
    if (segment !== "year") return value.padStart(2, "0");
    return expandTwoDigitYear(
      value,
      resolveYearAnchor(
        this.dateConfig()?.max as string | undefined,
        new Date(),
      ),
    );
  }

  /**
   * Normalise on blur: pad a single digit ("5" -> "05") and expand a two-digit
   * year against the field's upper bound ("85" -> 1985).
   */
  private handleDateSegmentBlur = (segment: DateSegment) => (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = target.value.replace(/\D/g, "");
    if (!value) return;

    const normalized = this.normalizeDateSegment(segment, value);

    if (normalized === value) return;
    target.value = normalized;
    this.setDateSegments({ ...this.dateSegments, [segment]: normalized });
  };

  /**
   * Backspace at the start of an empty segment moves to the previous one, so
   * the whole date can be cleared without reaching for the mouse.
   */
  private handleDateSegmentKeyDown =
    (segment: DateSegment) => (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.buttonClick.emit({ id: "submit", type: "submit", value: "next" });
        return;
      }
      if (e.key !== "Backspace") return;

      const target = e.target as HTMLInputElement;
      if (target.value.length > 0 || target.selectionStart !== 0) return;

      const order = this.getDateLayoutForField().order;
      const previous = order[order.indexOf(segment) - 1];
      if (previous) {
        e.preventDefault();
        this.focusDateSegment(previous);
      }
    };

  /**
   * Pasting a whole date into any segment fills all three. An ISO value is
   * read year-first; anything else follows the field's displayed order. A
   * two-digit year is expanded the same way a typed one is, so "15/03/85"
   * pastes as 1985 rather than falling through to the browser's own paste.
   */
  private handleDatePaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text") ?? "";
    const groups = text.match(/\d+/g);
    if (!groups || groups.length < 3) return;

    const [first, second, third] = groups;
    const isoLike = first!.length === 4;
    const order = isoLike
      ? (["year", "month", "day"] as DateSegment[])
      : this.getDateLayoutForField().order;

    const segments: Record<DateSegment, string> = {
      year: "",
      month: "",
      day: "",
    };
    [first!, second!, third!].forEach((group, index) => {
      const segment = order[index]!;
      segments[segment] = this.normalizeDateSegment(
        segment,
        group.slice(0, AuthheroNode.SEGMENT_LENGTH[segment]),
      );
    });

    if (!toIsoDate(segments)) return;

    e.preventDefault();
    this.setDateSegments(segments);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.buttonClick.emit({ id: "submit", type: "submit", value: "next" });
    }

    // In combined TEL+email mode, backspace on an empty field exits phone mode
    if (e.key === "Backspace" && !this.telEmailMode) {
      const target = e.target as HTMLInputElement;
      const config = (this.component as FieldComponent).config as
        | Record<string, unknown>
        | undefined;
      if (config?.allow_email === true && target.value.length === 0) {
        this.telEmailMode = true;
        this.localPhoneNumber = "";
        this.emitTelValue("");
      }
    }
  };

  private handleCodeInput = (
    e: Event,
    length: number,
    mode: "numeric" | "alphanumeric",
    autoSubmit: boolean,
  ) => {
    const target = e.target as HTMLInputElement;
    const disallowed = mode === "alphanumeric" ? /[^a-zA-Z0-9]/g : /\D/g;
    const cleaned = target.value.replace(disallowed, "").slice(0, length);
    // Reflect the sanitized value back so the visible boxes never show
    // characters we stripped (e.g. a pasted "123-456").
    if (cleaned !== target.value) {
      target.value = cleaned;
    }
    this.fieldChange.emit({ id: this.component.id, value: cleaned });
    if (autoSubmit && cleaned.length === length) {
      this.buttonClick.emit({ id: "submit", type: "submit", value: "next" });
    }
  };

  private handleCheckbox = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.fieldChange.emit({
      id: this.component.id,
      value: target.checked ? "true" : "false",
    });
  };

  /**
   * Returns the effective value for the field: uses `this.value` if set,
   * otherwise falls back to `config.default_value` (resolved by the server).
   */
  private getEffectiveValue(): string | undefined {
    if (this.value !== undefined && this.value !== null) {
      return this.value;
    }
    const comp = this.component as FieldComponent;
    if (comp.config && "default_value" in comp.config) {
      const dv = (comp.config as Record<string, unknown>).default_value;
      if (typeof dv === "string" && dv !== "") {
        return dv;
      }
    }
    return undefined;
  }

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
    // Always prevent default to avoid double submissions
    // The parent widget handles the actual form submission
    e.preventDefault();
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
    // Use string class instead of object to avoid hydration mismatch
    const labelClass = hasValue ? "input-label floating" : "input-label";
    return (
      <label class={labelClass} part="label" htmlFor={inputId}>
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
   * Get the input field class string.
   * Uses string instead of object to avoid hydration mismatch.
   */
  private getInputFieldClass(hasError: boolean): string {
    return hasError ? "input-field has-error" : "input-field";
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
        data-primary-action-button
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
    const { multiline, max_length, autocomplete } =
      component.config ?? ({} as any);
    const effectiveValue = this.getEffectiveValue();
    const hasValue = !!(effectiveValue && effectiveValue.length > 0);

    if (multiline) {
      return (
        <div class="input-wrapper" part="input-wrapper">
          {this.renderLabel(component.label, inputId, component.required)}
          <textarea
            id={inputId}
            class={this.getInputFieldClass(errors.length > 0)}
            part="input textarea"
            name={component.id}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            maxLength={max_length}
            onInput={this.handleInput}
          >
            {effectiveValue ?? ""}
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
            class={this.getInputFieldClass(errors.length > 0)}
            part="input"
            type={component.sensitive ? "password" : "text"}
            name={component.id}
            data-input-name={component.id}
            value={effectiveValue ?? ""}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            maxLength={max_length}
            autoComplete={autocomplete}
            onInput={this.handleInput}
            onKeyDown={this.handleKeyDown}
          />
          {this.renderFloatingLabel(
            component.label,
            inputId,
            component.required,
            hasValue,
          )}
          {this.renderInputBadge(component)}
        </div>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  /**
   * "Last used" badge on an input (TEXT/EMAIL identifier field) — the input
   * counterpart of the social button's button-social-badge, shown when the
   * previous login came in through this field instead of a social button.
   */
  private renderInputBadge(
    component: FieldComponent & { type: "TEXT" | "EMAIL" },
  ) {
    const config = component.config;
    if (config?.last_used !== true) {
      return null;
    }
    const safeId = this.sanitizeForCssToken(component.id);
    return (
      <span class="input-badge" part={`input-badge input-badge-${safeId}`}>
        {config.last_used_label || "Last used"}
      </span>
    );
  }

  /**
   * Segmented one-time-code input (e.g. SMS/email verification codes).
   *
   * Rendered as a SINGLE real <input> overlaid (transparent) on a row of
   * presentational boxes. This keeps native paste, iOS/Android SMS autofill
   * (`autocomplete="one-time-code"`) and screen-reader behaviour working —
   * all of which break when using one <input> per digit.
   */
  private renderCodeField(component: FieldComponent & { type: "CODE" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const hasError = errors.length > 0;
    const config = (component.config ?? {}) as {
      length?: number;
      mode?: "numeric" | "alphanumeric";
      auto_submit?: boolean;
      group_size?: number;
      separator?: string;
      placeholder?: string;
    };
    const length = config.length ?? 6;
    const mode = config.mode ?? "numeric";
    const autoSubmit = config.auto_submit !== false;
    const groupSize = config.group_size ?? 3;
    const separator = config.separator ?? "-";
    const placeholder = config.placeholder;
    // Apply the same mode sanitization used on input (handleCodeInput) so a
    // persisted/default value with invalid characters (e.g. "12-3a" in numeric
    // mode) doesn't render until edited.
    const disallowed = mode === "alphanumeric" ? /[^a-zA-Z0-9]/g : /\D/g;
    const value = (this.getEffectiveValue() ?? "")
      .replace(disallowed, "")
      .slice(0, length);

    const boxClass = (i: number) => {
      let cls = "code-box";
      if (i < value.length) cls += " is-filled";
      // Highlight the next empty box as the "caret" position while focused.
      if (!this.disabled && i === value.length) cls += " is-active";
      return cls;
    };

    const renderBox = (i: number) => (
      <div class={boxClass(i)} part="code-box">
        {value[i] ??
          (placeholder ? (
            <span class="code-box-placeholder">{placeholder}</span>
          ) : (
            ""
          ))}
      </div>
    );

    // Split into groups of `groupSize` (e.g. 3 → "123 - 456"); a non-positive
    // or >= length size means a single ungrouped row.
    const useGroups = groupSize > 0 && groupSize < length;
    const groups: number[][] = [];
    if (useGroups) {
      for (let start = 0; start < length; start += groupSize) {
        groups.push(
          Array.from(
            { length: Math.min(groupSize, length - start) },
            (_, j) => start + j,
          ),
        );
      }
    } else {
      groups.push(Array.from({ length }, (_, i) => i));
    }

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div
          class={hasError ? "code-field has-error" : "code-field"}
          part="code-field"
        >
          <input
            id={inputId}
            class="code-input"
            part="input code-input"
            type="text"
            name={component.id}
            data-input-name={component.id}
            value={value}
            inputMode={mode === "numeric" ? "numeric" : "text"}
            autoComplete="one-time-code"
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            maxLength={length}
            required={component.required}
            disabled={this.disabled}
            aria-label={component.label}
            aria-invalid={hasError ? "true" : "false"}
            onInput={(e) => this.handleCodeInput(e, length, mode, autoSubmit)}
            onKeyDown={this.handleKeyDown}
          />
          <div class="code-boxes" part="code-boxes" aria-hidden="true">
            {groups.map((group, gi) => [
              gi > 0 && separator ? (
                <span class="code-separator" part="code-separator">
                  {separator}
                </span>
              ) : null,
              <div class="code-group" part="code-group">
                {group.map((i) => renderBox(i))}
              </div>,
            ])}
          </div>
        </div>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderEmailField(component: FieldComponent & { type: "EMAIL" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const effectiveValue = this.getEffectiveValue();
    const hasValue = !!(effectiveValue && effectiveValue.length > 0);
    const { autocomplete } = (component.config ?? {}) as any;

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container">
          <input
            id={inputId}
            class={this.getInputFieldClass(errors.length > 0)}
            part="input"
            type="email"
            name={component.id}
            data-input-name={component.id}
            value={effectiveValue ?? ""}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            autocomplete={autocomplete || "email"}
            onInput={this.handleInput}
            onKeyDown={this.handleKeyDown}
          />
          {this.renderFloatingLabel(
            component.label,
            inputId,
            component.required,
            hasValue,
          )}
          {this.renderInputBadge(component)}
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
    const effectiveValue = this.getEffectiveValue();
    const hasValue = !!(effectiveValue && effectiveValue.length > 0);
    const forgotPasswordLink = component.config?.forgot_password_link;

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container password-container">
          <input
            id={inputId}
            class={this.getInputFieldClass(errors.length > 0)}
            part="input"
            type={this.passwordVisible ? "text" : "password"}
            name={component.id}
            data-input-name={component.id}
            value={effectiveValue ?? ""}
            placeholder=" "
            required={component.required}
            disabled={this.disabled}
            minLength={component.config?.min_length}
            autocomplete="current-password"
            onInput={this.handleInput}
            onKeyDown={this.handleKeyDown}
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
    const effectiveValue = this.getEffectiveValue();

    return (
      <div class="input-wrapper" part="input-wrapper">
        {this.renderLabel(component.label, inputId, component.required)}
        <input
          id={inputId}
          class={this.getInputFieldClass(errors.length > 0)}
          part="input"
          type="number"
          name={component.id}
          value={effectiveValue ?? ""}
          placeholder={placeholder}
          required={component.required}
          disabled={this.disabled}
          min={min}
          max={max}
          step={step}
          onInput={this.handleInput}
          onKeyDown={this.handleKeyDown}
        />
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderTelField(component: FieldComponent & { type: "TEL" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const config = component.config as Record<string, unknown> | undefined;
    const allowEmail = config?.allow_email === true;
    const hasValue = this.localPhoneNumber.length > 0;

    // In allow_email mode, show the country picker only when the user is typing a phone number
    const showCountryPicker = allowEmail ? !this.telEmailMode : true;

    // Calculate dynamic width: flag + space + dial code + small padding for dropdown arrow
    const selectedText = `${this.selectedCountry.flag} ${this.selectedCountry.dialCode}`;
    const selectWidth = `${selectedText.length + 1}ch`;

    const countrySelect = showCountryPicker ? (
      <select
        class="country-select"
        part="country-select"
        style={{ width: selectWidth, minWidth: "0" }}
        onChange={this.handleCountryChange}
        disabled={this.disabled}
        aria-label="Country code"
      >
        {countries.map((country) => (
          <option
            value={country.code}
            selected={this.selectedCountry.code === country.code}
            key={country.code}
          >
            {`${country.flag} ${country.dialCode}`}
          </option>
        ))}
      </select>
    ) : null;

    const inputType = allowEmail && this.telEmailMode ? "text" : "tel";

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div
          class={showCountryPicker ? "phone-input-wrapper" : ""}
          part="phone-input-wrapper"
        >
          {countrySelect}
          <div class="input-container">
            <input
              id={inputId}
              class={this.getInputFieldClass(errors.length > 0)}
              part="input"
              type={inputType}
              name={component.id}
              data-input-name={component.id}
              value={this.localPhoneNumber}
              placeholder=" "
              required={component.required}
              disabled={this.disabled}
              autocomplete={
                allowEmail && this.telEmailMode ? "email" : "tel-national"
              }
              onInput={this.handlePhoneInput}
              onKeyDown={this.handleKeyDown}
            />
            {this.renderFloatingLabel(
              component.label,
              inputId,
              component.required,
              hasValue,
            )}
          </div>
        </div>
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  private renderUrlField(component: FieldComponent & { type: "URL" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const effectiveValue = this.getEffectiveValue();

    return (
      <div class="input-wrapper" part="input-wrapper">
        {this.renderLabel(component.label, inputId, component.required)}
        <input
          id={inputId}
          class={this.getInputFieldClass(errors.length > 0)}
          part="input"
          type="url"
          name={component.id}
          value={effectiveValue ?? ""}
          placeholder={component.config?.placeholder}
          required={component.required}
          disabled={this.disabled}
          onInput={this.handleInput}
          onKeyDown={this.handleKeyDown}
        />
        {this.renderErrors()}
        {errors.length === 0 && this.renderHint(component.hint)}
      </div>
    );
  }

  /**
   * DATE is rendered as three numeric segments rather than `input type=date`.
   * A native date input renders differently in every browser (Safari adds a
   * stepper), keeps its dd/mm/yyyy hint visible while half-filled, and asks
   * for a calendar gesture to reach a year decades back — all wrong for a
   * date typed from memory, which is what these fields collect.
   */
  private renderDateField(component: FieldComponent & { type: "DATE" }) {
    const errors = this.getErrors();
    const { format } = component.config ?? {};
    const layout = getDateLayout(format, this.locale);
    const isoValue = this.dateIsoValue(this.dateSegments);
    // Every segment filled but no ISO value means the date does not exist
    // (31 February) or falls outside min/max. Flag it rather than silently
    // submitting nothing — the widget posts JSON, so the browser's own
    // constraint validation never runs.
    const isIncomplete = layout.order.some(
      (segment) => this.dateSegments[segment].length === 0,
    );
    const hasInvalidDate = !isoValue && !isIncomplete;
    const hasError = errors.length > 0 || hasInvalidDate;
    const firstInputId = `input-${component.id}`;

    const segmentInput = (segment: DateSegment) => (
      <input
        key={segment}
        id={segment === layout.order[0] ? firstInputId : undefined}
        class="date-segment"
        part={`input date-segment date-segment-${segment}`}
        type="text"
        inputmode="numeric"
        autocomplete={AuthheroNode.SEGMENT_AUTOCOMPLETE[segment]}
        data-date-segment={segment}
        maxlength={AuthheroNode.SEGMENT_LENGTH[segment]}
        size={AuthheroNode.SEGMENT_LENGTH[segment]}
        value={this.dateSegments[segment]}
        placeholder={layout.tokens[segment]}
        aria-label={layout.tokens[segment]}
        aria-invalid={hasError ? "true" : "false"}
        required={component.required}
        disabled={this.disabled}
        onInput={this.handleDateSegmentInput(segment)}
        onBlur={this.handleDateSegmentBlur(segment)}
        onKeyDown={this.handleDateSegmentKeyDown(segment)}
        onPaste={this.handleDatePaste}
      />
    );

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container">
          <div
            class={hasError ? "date-input has-error" : "date-input"}
            part="date-input"
            role="group"
            aria-label={component.label}
          >
            {layout.order.map((segment, index) => [
              index > 0 && (
                <span
                  key={`sep-${segment}`}
                  class="date-separator"
                  part="date-separator"
                  aria-hidden="true"
                >
                  {layout.separator}
                </span>
              ),
              segmentInput(segment),
            ])}
          </div>
          {/* The group is never empty (it shows DD/MM/YYYY), so the label
              stays in its floated position like other always-filled fields. */}
          {this.renderFloatingLabel(
            component.label,
            firstInputId,
            component.required,
            true,
          )}
        </div>
        {/* The submitted value: a single ISO date, whatever the display order. */}
        <input
          type="hidden"
          name={component.id}
          data-input-name={component.id}
          value={isoValue}
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
            // Once the field has a value it is authoritative — falling back to
            // the default here would keep a ticked-by-default box ticked after
            // the user unticks it.
            this.value === undefined
              ? component.config?.default_value === true
              : this.value === "true"
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

  private renderCountryField(component: FieldComponent & { type: "COUNTRY" }) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const { placeholder } = component.config ?? {};
    const hasValue = true;
    const effectiveValue = this.getEffectiveValue();

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container">
          <select
            id={inputId}
            class={this.getInputFieldClass(errors.length > 0)}
            part="input select"
            name={component.id}
            required={component.required}
            disabled={this.disabled}
            onChange={this.handleInput}
          >
            {placeholder && (
              <option value="" disabled selected={!effectiveValue}>
                {placeholder}
              </option>
            )}
            {countries.map((c) => (
              <option
                value={c.code}
                selected={effectiveValue === c.code}
                key={c.code}
              >
                {c.flag} {c.name}
              </option>
            ))}
          </select>
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

  private renderDropdownField(
    component: FieldComponent & { type: "DROPDOWN" },
  ) {
    const inputId = `input-${component.id}`;
    const errors = this.getErrors();
    const { options, placeholder } = component.config ?? {};
    // Dropdown always has visual content (selected option), so always float the label
    const hasValue = true;
    const effectiveValue = this.getEffectiveValue();

    return (
      <div class="input-wrapper" part="input-wrapper">
        <div class="input-container">
          <select
            id={inputId}
            class={this.getInputFieldClass(errors.length > 0)}
            part="input select"
            name={component.id}
            required={component.required}
            disabled={this.disabled}
            onChange={this.handleInput}
          >
            {placeholder && (
              <option value="" disabled selected={!effectiveValue}>
                {placeholder}
              </option>
            )}
            {options?.map((opt) => (
              <option
                value={opt.value}
                selected={effectiveValue === opt.value}
                key={opt.value}
              >
                {opt.label}
              </option>
            ))}
          </select>
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
                checked={this.getEffectiveValue() === opt.value}
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
          href?: string;
          last_used?: boolean;
          last_used_label?: string;
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
      const safeProvider = this.sanitizeForCssToken(provider);
      if (details?.icon_url) {
        return (
          <img
            class="social-icon"
            part={`social-icon social-icon-${safeProvider}`}
            src={details.icon_url}
            alt={details.display_name || provider}
          />
        );
      }
      // No icon provided - return null (button will just show text)
      return null;
    };

    // Get strategy from provider details
    const getProviderStrategy = (provider: string): string => {
      const details = detailsMap.get(provider);
      return details?.strategy ?? provider;
    };

    return (
      <div class="social-buttons" part="social-buttons">
        {providers.map((provider) => {
          const safeProvider = this.sanitizeForCssToken(provider);
          const strategy = getProviderStrategy(provider);
          const icon = getProviderIcon(provider);
          const details = detailsMap.get(provider);
          const lastUsed = details?.last_used === true;
          const btnClass = `btn btn-secondary btn-social btn-social-${safeProvider}${icon ? "" : " no-icon"}${lastUsed ? " btn-social-last-used" : ""}`;
          const btnPart = `button button-secondary button-social button-social-${safeProvider}${lastUsed ? " button-social-last-used" : ""}`;
          const content = [
            icon,
            <span
              class="btn-social-content"
              part={`button-social-content button-social-content-${safeProvider}`}
            >
              <span
                part={`button-social-text button-social-text-${safeProvider}`}
              >
                {getButtonText(provider)}
              </span>
              <span
                class="btn-social-subtitle"
                part={`button-social-subtitle button-social-subtitle-${safeProvider}`}
              ></span>
            </span>,
            // "Last used" badge — separate element from .btn-social-subtitle,
            // whose ::part() + content trick is documented for tenant use.
            details?.last_used ? (
              <span
                class="btn-social-badge"
                part={`button-social-badge button-social-badge-${safeProvider}`}
              >
                {details.last_used_label || "Last used"}
              </span>
            ) : null,
          ];

          if (details?.href) {
            return (
              <a
                href={this.disabled ? undefined : details.href}
                class={btnClass}
                part={btnPart}
                data-connection-name={provider}
                data-strategy={strategy}
                key={provider}
                aria-disabled={this.disabled ? "true" : undefined}
                tabindex={this.disabled ? -1 : undefined}
                onClick={(e: Event) => {
                  if (this.disabled) {
                    e.preventDefault();
                  }
                }}
              >
                {content}
              </a>
            );
          }

          return (
            <button
              type="button"
              class={btnClass}
              part={btnPart}
              data-connection-name={provider}
              data-strategy={strategy}
              disabled={this.disabled}
              onClick={(e) => this.handleButtonClick(e, "SOCIAL", provider)}
              key={provider}
            >
              {content}
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
      case "CODE":
        return this.renderCodeField(
          this.component as FieldComponent & { type: "CODE" },
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
      case "COUNTRY":
        return this.renderCountryField(
          this.component as FieldComponent & { type: "COUNTRY" },
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
