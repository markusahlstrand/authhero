/**
 * Universal Login Template — Liquid-based slot rendering.
 *
 * Tenants opt into custom chrome by uploading a body fragment. The fragment
 * is rendered with Liquid (the same engine used for email templates), so it
 * supports variables (`{{ branding.logo_url }}`), control flow
 * (`{% if … %}`), and the AuthHero slot tags below.
 *
 * The page shell (`<!DOCTYPE>`, `<html>`, `<head>`, body styles, dark-mode
 * runtime, background tint) is fixed in code — it's not part of the tenant
 * template. The template only controls the body layout: which chips render,
 * and any content placed in the in-flow regions around the widget.
 *
 * Slot tags (rendered by the `auth0` / `authhero` custom tags):
 *   `{%- auth0:widget -%}`             — widget container (required)
 *   `{%- authhero:logo -%}`            — logo chip (top-left)
 *   `{%- authhero:settings -%}`        — settings chip (top-right), wraps the
 *                                        dark-mode toggle + language picker
 *   `{%- authhero:dark-mode-toggle -%}`— dark-mode button only
 *   `{%- authhero:language-picker -%}` — language picker only
 *   `{%- authhero:powered-by -%}`      — powered-by chip (bottom-left)
 *   `{%- authhero:legal -%}`           — legal/terms chip (bottom-right)
 *
 * In-flow regions above/below the widget are authored directly in the
 * template using the `.ah-above-widget` / `.ah-below-widget` helper classes
 * (see `DEFAULT_UNIVERSAL_LOGIN_TEMPLATE` for the stacked layout). They live
 * in normal document flow, unlike the fixed-position corner chips, so they're
 * plain markup the tenant writes rather than dedicated tags.
 *
 * Template variables exposed to Liquid:
 *   `branding`           — the tenant Branding object (logo_url, colors, …)
 *   `theme`              — the resolved Theme object
 *   `client.name`        — the application name
 *   `prompt.screen.name` — the current screen id (Auth0-compatible)
 *   `locale`             — the active language code
 */

import { Liquid, type TagToken, type Context } from "liquidjs";
import type { Branding, Theme } from "@authhero/adapter-interfaces";
import {
  LogoChip,
  SettingsChip,
  DarkModeToggle,
  LanguagePicker,
  PoweredByChip,
  LegalChip,
  type DarkModePreference,
  type ChipStyle,
} from "./u2-widget-page";

/**
 * Exact default-form widget token. Kept for the default template body and as
 * a convenience export. Use {@link templateMountsWidget} for validation —
 * it accepts every valid Liquid spelling of the widget tag, not just this one.
 */
export const REQUIRED_SLOT = "{%- auth0:widget -%}";

/** Matches the widget mount tag in any valid Liquid spelling (with/without
 *  whitespace-trim dashes and surrounding spaces). */
const WIDGET_TAG_RE = /\{%-?\s*auth0\s*:\s*widget\s*-?%\}/;

/**
 * Canonical default body. Mirrors the layout the JSX `WidgetPage` emits.
 * Tenants who want to hide a chip should copy this, delete a slot, and PUT
 * it back via `PUT /api/v2/branding/templates/universal-login`.
 *
 * The widget is wrapped in a centered `.ah-widget-stack` so tenants can drop
 * content into the `.ah-above-widget` / `.ah-below-widget` regions; both are
 * empty (and collapse to nothing) by default.
 */
export const DEFAULT_UNIVERSAL_LOGIN_TEMPLATE = `<div class="ah-widget-stack">
  <div class="ah-above-widget" data-ah-slot="above-widget"></div>
  {%- auth0:widget -%}
  <div class="ah-below-widget" data-ah-slot="below-widget"></div>
</div>
{%- authhero:logo -%}
{%- authhero:settings -%}
{%- authhero:powered-by -%}
{%- authhero:legal -%}
`;

export type TemplateSlotOptions = {
  widgetHtml: string;
  logoUrl?: string | null;
  clientName: string;
  darkMode: DarkModePreference;
  language?: string;
  availableLanguages?: string[];
  poweredBy?: {
    url: string;
    href?: string;
    alt?: string;
    height?: number;
  };
  termsAndConditionsUrl?: string;
  /** Full branding/theme objects, exposed to the template as Liquid variables. */
  branding?: Branding | null;
  theme?: Theme | null;
  /**
   * HTML emitted by the `{%- auth0:head -%}` slot. Only set on the
   * full-document (Auth0-compatible) render path; in the body-fragment path
   * the slot renders empty because the shell owns the `<head>`.
   */
  headHtml?: string;
};

// Render-scope key under which the resolved slot HTML fragments are passed.
// Tags read fragments from here so the engine can be shared across requests
// without re-registration, while the fragment content stays per-request.
const SLOTS_KEY = "__authheroSlots";

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function widgetContainerHtml(
  widgetHtml: string,
  screenId: string,
  containerStyle?: string,
): string {
  const styleAttr = containerStyle ? ` style="${containerStyle}"` : "";
  return `<div class="widget-container" data-authhero-widget-container data-screen="${escapeAttr(
    screenId,
  )}"${styleAttr}>${widgetHtml}</div>`;
}

// ---------------------------------------------------------------------------
// Liquid engine + slot tags
// ---------------------------------------------------------------------------

const engine = new Liquid({
  cache: true,
  strictVariables: false,
  strictFilters: false,
});

/** Parse an optional `style="pill|plain|auto"` argument from a slot tag. */
function parseSlotStyle(rest: string): ChipStyle | undefined {
  const match = rest.match(/style\s*=\s*["']?(auto|plain|pill)["']?/i);
  const value = match?.[1]?.toLowerCase();
  if (value === "auto" || value === "plain" || value === "pill") {
    return value;
  }
  return undefined;
}

/**
 * Register a namespaced slot tag (`auth0` / `authhero`). The tag name is the
 * Liquid token before the colon; the first word after it (e.g. `:widget`) is
 * the slot key, and any trailing `style="…"` argument selects the chip
 * variant. The rendered HTML comes from per-request fragment factories in the
 * render scope, so unknown/omitted slots render empty.
 */
function registerSlotTag(namespace: "auth0" | "authhero") {
  engine.registerTag(namespace, {
    parse(token: TagToken) {
      // token.args is everything after the tag name, e.g. ':legal style="plain"'.
      const raw = String(token.args || "")
        .replace(/^:/, "")
        .trim();
      const [slot, ...rest] = raw.split(/\s+/);
      this.slot = slot ?? "";
      this.slotStyle = parseSlotStyle(rest.join(" "));
    },
    render(ctx: Context) {
      const fragments = ctx.get([SLOTS_KEY]);
      const factory = fragments?.[`${namespace}:${this.slot}`];
      return typeof factory === "function" ? factory(this.slotStyle) : "";
    },
  });
}

registerSlotTag("auth0");
registerSlotTag("authhero");

type SlotFactory = (style?: ChipStyle) => string;

function buildSlotFragments(
  opts: TemplateSlotOptions & {
    screenId: string;
    widgetContainerStyle?: string;
  },
): Record<string, SlotFactory> {
  return {
    "auth0:widget": () =>
      widgetContainerHtml(
        opts.widgetHtml,
        opts.screenId,
        opts.widgetContainerStyle,
      ),
    // Auth0-compatibility: in a full-document template this expands to the
    // head essentials (page CSS, fonts, widget script, dark-mode runtime).
    // Empty on the body-fragment path, where the shell owns the <head>.
    "auth0:head": () => opts.headHtml ?? "",
    "authhero:logo": (style) =>
      (
        <LogoChip
          logoUrl={opts.logoUrl}
          clientName={opts.clientName}
          variant={style}
        />
      ).toString(),
    "authhero:settings": (style) =>
      (
        <SettingsChip
          darkMode={opts.darkMode}
          language={opts.language}
          availableLanguages={opts.availableLanguages}
          variant={style}
        />
      ).toString(),
    "authhero:dark-mode-toggle": () =>
      (<DarkModeToggle darkMode={opts.darkMode} />).toString(),
    "authhero:language-picker": () =>
      opts.availableLanguages
        ? (
            <LanguagePicker
              language={opts.language}
              availableLanguages={opts.availableLanguages}
            />
          ).toString()
        : "",
    "authhero:powered-by": (style) =>
      opts.poweredBy
        ? (
            <PoweredByChip
              url={opts.poweredBy.url}
              href={opts.poweredBy.href}
              alt={opts.poweredBy.alt}
              height={opts.poweredBy.height}
              variant={style}
            />
          ).toString()
        : "",
    "authhero:legal": (style) =>
      opts.termsAndConditionsUrl
        ? (
            <LegalChip
              termsAndConditionsUrl={opts.termsAndConditionsUrl}
              language={opts.language}
              variant={style}
            />
          ).toString()
        : "",
  };
}

/** True when `body` mounts the widget in any valid Liquid spelling. */
export function templateMountsWidget(body: string): boolean {
  return WIDGET_TAG_RE.test(body);
}

/**
 * True when the template is a full HTML document (Auth0-style) rather than a
 * body fragment. Full documents own their own `<html>`/`<head>`/`<body>` and
 * are rendered as the whole page, with `{%- auth0:head -%}` injecting the head
 * essentials. Body fragments are wrapped in AuthHero's fixed page shell.
 */
export function templateIsFullDocument(body: string): boolean {
  return /<html[\s>]/i.test(body);
}

/**
 * Validate a tenant template before storing it: it must mount the widget and
 * must be syntactically valid Liquid (so a save can't break the login page).
 */
export function validateUniversalLoginTemplate(
  body: string,
): { valid: true } | { valid: false; error: string } {
  if (!templateMountsWidget(body)) {
    return {
      valid: false,
      error: `Template must contain the ${REQUIRED_SLOT} tag`,
    };
  }
  try {
    engine.parse(body);
  } catch (err) {
    return {
      valid: false,
      error: `Template is not valid Liquid: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  return { valid: true };
}

/**
 * Render a tenant template body to HTML, expanding slot tags and Liquid
 * variables. Falls back to the known-good default template (and finally to
 * the bare widget) if rendering throws, so a malformed template can never
 * take the login page down.
 */
export async function applyUniversalLoginTemplate(
  template: string,
  opts: TemplateSlotOptions & {
    screenId: string;
    widgetContainerStyle?: string;
  },
): Promise<string> {
  const fragments = buildSlotFragments(opts);
  const pageBackground = opts.theme?.page_background;
  const scope = {
    [SLOTS_KEY]: fragments,
    branding: opts.branding ?? undefined,
    theme: opts.theme ?? undefined,
    client: { name: opts.clientName },
    prompt: { screen: { name: opts.screenId } },
    locale: opts.language,
    // Page context for conditional layout — e.g. choosing chip styling based
    // on whether a background image is present.
    page: {
      has_background_image: Boolean(pageBackground?.background_image_url),
      dark_mode: opts.darkMode,
      logo_position: pageBackground?.logo_placement ?? "widget",
      layout: pageBackground?.page_layout ?? "center",
    },
  };

  try {
    return await engine.parseAndRender(template, scope);
  } catch (err) {
    console.error("Universal login template render failed:", err);
    try {
      return await engine.parseAndRender(
        DEFAULT_UNIVERSAL_LOGIN_TEMPLATE,
        scope,
      );
    } catch {
      return fragments["auth0:widget"]?.() ?? "";
    }
  }
}
