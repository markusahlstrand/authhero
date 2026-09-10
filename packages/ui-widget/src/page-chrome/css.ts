/**
 * Page CSS and body layout for the login page.
 *
 * The single source of truth for the chrome around the widget card: chip
 * tokens, floating corner chips, the phone footer bar, background tint, view
 * transitions and the responsive breakpoints. Both the authhero login page
 * and the widget demo server render from this, so a change to the phone
 * layout can't show up in one and not the other.
 */
import { darkModeCssVarRules } from "./colors";
import { buildThemePageBackground } from "./html";
import type { BrandingPageBackground, ThemePageBackground } from "./html";

/** Layout values for the page `<body>` — shared by the body-fragment path
 *  (applied inline) and the full-document path (emitted into the stylesheet). */
export type BodyLayout = {
  background: string;
  fontFamily: string;
  justifyContent: string;
  padding: string;
};

/**
 * Resolve the page-body layout (centering, background, font) from the theme
 * and branding. Keeps the inline `<body>` style (fragment path) and the
 * `auth0:head` stylesheet rule (full-document path) in sync so an Auth0-style
 * template centers on the page background just like the default chrome does.
 *
 * The "left"/"right" offsets below are the wide-viewport values; the mobile
 * block in `buildPageCss` collapses them back to centered under 768px.
 */
export function buildBodyLayout(opts: {
  themePageBackground?: ThemePageBackground;
  brandingPageBackground?: BrandingPageBackground;
  fontUrl?: string | null;
}): BodyLayout {
  const pageLayout = opts.themePageBackground?.page_layout || "center";
  const justifyContent =
    pageLayout === "left"
      ? "flex-start"
      : pageLayout === "right"
        ? "flex-end"
        : "center";
  const padding =
    pageLayout === "left"
      ? "20px 20px 20px 80px"
      : pageLayout === "right"
        ? "20px 80px 20px 20px"
        : "20px";
  return {
    background: buildThemePageBackground(
      opts.themePageBackground,
      opts.brandingPageBackground,
    ),
    fontFamily: opts.fontUrl
      ? "'Inter', system-ui, sans-serif"
      : "system-ui, -apple-system, sans-serif",
    justifyContent,
    padding,
  };
}

export function buildPageCss(opts: {
  primaryColor?: string;
  themePrimary?: string;
  widgetBackground: string;
  /**
   * Whether `theme.page_background.background_image_url` is set. Drives the
   * phone layout: with an image the card floats on the background, without
   * one it goes full-bleed. See the MOBILE block below.
   */
  hasBgImage?: boolean;
  /**
   * Page-body layout (centering, background, font). Only the full-document
   * (Auth0-style) path passes this — there the tenant owns `<body>`, so the
   * centering/background that the body-fragment path applies inline must come
   * from the stylesheet instead. The fragment path omits it: its inline
   * `<body>` style already covers layout and wins over a stylesheet rule.
   */
  bodyLayout?: BodyLayout;
}): string {
  const {
    primaryColor,
    themePrimary,
    widgetBackground,
    bodyLayout,
    hasBgImage,
  } = opts;
  const bodyRule = bodyLayout
    ? `
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: ${bodyLayout.justifyContent};
      background: ${bodyLayout.background};
      font-family: ${bodyLayout.fontFamily};
      padding: ${bodyLayout.padding};
    }`
    : "";
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ${bodyRule}

    /* ============= STEP TRANSITIONS =============
       Cross-document view transitions morph the widget's box between
       login steps (e.g. when the next step is taller) and cross-fade the
       form content, à la Stripe's dashboard login. This is opt-in per
       same-origin navigation and a no-op (instant nav) on browsers that
       don't support it yet. The widget is lifted into its own named group
       so only it animates its size; the rest of the page (background +
       chips) cross-fades via the default \`root\` group, which is invisible
       since those are unchanged between steps. */
    @view-transition { navigation: auto; }

    /* Resize-forward (Stripe-style): the widget box morphs its height from
       the old step to the new one — that resize is the main motion. Content
       keeps its natural height (height: auto) so the snapshot isn't stretched
       to the morphing box, and does a quick, clean cross-fade underneath. */
    ::view-transition-group(ah-widget) {
      animation-duration: 420ms;
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    ::view-transition-old(ah-widget),
    ::view-transition-new(ah-widget) {
      height: auto;
    }
    ::view-transition-old(ah-widget) {
      animation: 140ms ease both ah-widget-out;
    }
    ::view-transition-new(ah-widget) {
      animation: 240ms ease 110ms both ah-widget-in;
    }
    @keyframes ah-widget-out { to { opacity: 0; } }
    @keyframes ah-widget-in { from { opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      ::view-transition-group(*),
      ::view-transition-old(*),
      ::view-transition-new(*) { animation: none !important; }
    }

    /* ============= CHROME TOKENS =============
       The chip surface tokens flip based on:
         - data-mode (light/dark) — controls fg/bg pair
         - data-bg (image/none)   — toggles whether chips have a surface
       This keeps a single chip ruleset for all four combinations. */
    :root {
      /* Pill surface values live in their own *-pill vars so they survive the
         data-bg="none" reset below; the base tokens reference them, and the
         .ah-chip--pill modifier re-points the base tokens back at them to
         force a pill even on a solid background. */
      --ah-chip-bg-pill:       rgba(15,17,21,0.55);
      --ah-chip-bg-hover-pill: rgba(15,17,21,0.75);
      --ah-chip-border-pill:   rgba(255,255,255,0.12);
      --ah-chip-logo-bg-pill:  rgba(15,17,21,0.4);
      --ah-chip-bg:        var(--ah-chip-bg-pill);
      --ah-chip-bg-hover:  var(--ah-chip-bg-hover-pill);
      --ah-chip-border:    var(--ah-chip-border-pill);
      --ah-chip-fg:        rgba(255,255,255,0.85);
      --ah-chip-fg-dim:    rgba(255,255,255,0.6);
      --ah-chip-fg-mid:    rgba(255,255,255,0.7);
      --ah-chip-fg-strong: rgba(255,255,255,0.95);
      --ah-chip-active-bg: rgba(255,255,255,0.14);
      --ah-chip-logo-bg:   var(--ah-chip-logo-bg-pill);
      --ah-legal-fg:       rgba(255,255,255,0.55);
      --ah-legal-fg-hover: rgba(255,255,255,0.95);
      --ah-legal-sep:      rgba(255,255,255,0.25);
      /* Phone footer bar. The surface follows data-bg (a translucent slab
         over a background image, nothing over a solid one); the foreground
         and hairline follow light/dark like every other chrome token. */
      --ah-footer-bg:        var(--ah-chip-bg-pill);
      --ah-footer-border:    rgba(255,255,255,0.12);
      --ah-footer-fg:        rgba(255,255,255,0.70);
      --ah-footer-fg-strong: rgba(255,255,255,0.95);
      --ah-bg-tint: radial-gradient(
        ellipse at center,
        rgba(15,23,48,0.30) 0%,
        rgba(15,23,48,0.55) 70%,
        rgba(10,15,30,0.78) 100%);
    }

    /* Light page mode — flip to dark text on translucent white chips.
       The :root block above seeds dark tokens; data-mode="light" overrides
       them when the toggle is explicit, and the prefers-color-scheme block
       below mirrors them when the user is in auto mode (no data-mode set). */
    html[data-mode="light"] {
      --ah-chip-bg-pill:       rgba(255,255,255,0.7);
      --ah-chip-bg-hover-pill: rgba(255,255,255,0.92);
      --ah-chip-border-pill:   rgba(15,17,21,0.08);
      --ah-chip-logo-bg-pill:  rgba(255,255,255,0.75);
      --ah-chip-fg:        #0f1115;
      --ah-chip-fg-dim:    rgba(15,17,21,0.55);
      --ah-chip-fg-mid:    rgba(15,17,21,0.65);
      --ah-chip-fg-strong: rgba(15,17,21,0.95);
      --ah-chip-active-bg: rgba(15,17,21,0.08);
      --ah-legal-fg:       rgba(15,17,21,0.5);
      --ah-legal-fg-hover: rgba(15,17,21,0.9);
      --ah-legal-sep:      rgba(15,17,21,0.2);
      --ah-footer-border:    rgba(15,17,21,0.10);
      --ah-footer-fg:        rgba(15,17,21,0.60);
      --ah-footer-fg-strong: rgba(15,17,21,0.95);
      --ah-bg-tint: transparent;
    }

    @media (prefers-color-scheme: light) {
      html:not([data-mode]) {
        --ah-chip-bg-pill:       rgba(255,255,255,0.7);
        --ah-chip-bg-hover-pill: rgba(255,255,255,0.92);
        --ah-chip-border-pill:   rgba(15,17,21,0.08);
        --ah-chip-logo-bg-pill:  rgba(255,255,255,0.75);
        --ah-chip-fg:        #0f1115;
        --ah-chip-fg-dim:    rgba(15,17,21,0.55);
        --ah-chip-fg-mid:    rgba(15,17,21,0.65);
        --ah-chip-fg-strong: rgba(15,17,21,0.95);
        --ah-chip-active-bg: rgba(15,17,21,0.08);
        --ah-legal-fg:       rgba(15,17,21,0.5);
        --ah-legal-fg-hover: rgba(15,17,21,0.9);
        --ah-legal-sep:      rgba(15,17,21,0.2);
        --ah-footer-border:    rgba(15,17,21,0.10);
        --ah-footer-fg:        rgba(15,17,21,0.60);
        --ah-footer-fg-strong: rgba(15,17,21,0.95);
        --ah-bg-tint: transparent;
      }
    }

    /* No background image — chips become text-only on a solid page color */
    html[data-bg="none"] {
      --ah-chip-bg:        transparent;
      --ah-chip-bg-hover:  transparent;
      --ah-chip-border:    transparent;
      --ah-chip-logo-bg:   transparent;
      /* On a solid page the phone footer sits directly on the widget's own
         surface, so a translucent slab would read as a seam. Hairline only. */
      --ah-footer-bg:      transparent;
      --ah-bg-tint:        transparent;
    }

    /* ============= BACKGROUND TINT =============
       Only renders when bg image is present. The token is transparent
       in data-bg=none mode so the element stays in the DOM but invisible. */
    .ah-bg-tint {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background: var(--ah-bg-tint);
      transition: background 300ms ease;
    }
    .widget-container {
      position: relative;
      z-index: 1;
      /* Names this box as its own view-transition group so its size morphs
         smoothly across step navigations (see STEP TRANSITIONS above). */
      view-transition-name: ah-widget;
    }

    /* ============= IN-FLOW WIDGET STACK =============
       Optional wrapper (used by the default custom template) that places
       in-flow content directly above/below the widget card, sharing its
       width and centering. Unlike the fixed-position corner chips, these
       regions are normal document flow — tenants author content into them
       in their template. Empty regions collapse so they add no spacing. */
    .ah-widget-stack {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      width: clamp(320px, 100%, 400px);
    }
    .ah-widget-stack .widget-container { width: 100%; }
    .ah-above-widget, .ah-below-widget {
      width: 100%;
      text-align: center;
      color: var(--ah-chip-fg);
      font-size: 13px;
      line-height: 1.5;
    }
    .ah-above-widget:empty, .ah-below-widget:empty { display: none; }
    .ah-above-widget a, .ah-below-widget a { color: var(--ah-color-link, #2563eb); }

    /* The "widget" logo position is rendered by the widget's own shadow DOM
       (see authhero-widget.tsx). The page only renders a logo when the
       caller opts into the chip variant. */
    html[data-logo-position="widget"] .ah-chip-logo,
    html[data-logo-position="none"] .ah-chip-logo { display: none; }

    /* ============= FLOATING CHIPS =============
       Self-contained pills positioned at page corners. Surface comes from
       the chrome tokens above, so they adapt to mode + bg automatically. */
    .ah-chip {
      position: fixed;
      z-index: 10;
      background: var(--ah-chip-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--ah-chip-border);
      color: var(--ah-chip-fg);
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
    }

    .ah-chip-logo {
      top: 24px; left: 24px;
      padding: 6px 14px 6px 8px;
      background: var(--ah-chip-logo-bg);
    }
    .ah-chip-logo img { display: block; max-height: 20px; width: auto; }
    .ah-chip-logo .ah-logo-text {
      font-family: 'Inter Tight', 'Inter', system-ui, sans-serif;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 12px;
    }

    .ah-chip-settings {
      top: 24px; right: 24px;
      padding: 4px;
      gap: 0;
    }
    .ah-chip-settings button,
    .ah-chip-settings .ah-lang {
      background: 0; border: 0; padding: 6px 10px; cursor: pointer;
      color: var(--ah-chip-fg-dim);
      font-size: 12px; font-weight: 500;
      border-radius: 9999px;
      display: inline-flex; align-items: center; gap: 5px;
      transition: 140ms;
    }
    .ah-chip-settings button:hover,
    .ah-chip-settings .ah-lang:hover { color: var(--ah-chip-fg-strong); }
    .ah-chip-settings .ah-lang select {
      appearance: none; -webkit-appearance: none;
      background: transparent; color: inherit; border: 0;
      font: inherit; cursor: pointer; padding: 0;
      outline: 0;
    }

    .ah-chip-trust {
      bottom: 24px; left: 24px;
      padding: 7px 14px 7px 10px;
      color: var(--ah-chip-fg-mid);
    }
    .ah-chip-trust img { display: block; max-height: 18px; width: auto; opacity: 0.85; }
    .ah-chip-trust:hover { color: var(--ah-chip-fg-strong); }
    .ah-chip-trust a { color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }

    /* Legal — chip when there's a bg image, plain text on solid bg */
    .ah-chip-legal {
      position: fixed;
      bottom: 24px; right: 24px;
      z-index: 10;
      background: var(--ah-chip-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--ah-chip-border);
      border-radius: 9999px;
      padding: 7px 14px;
      color: var(--ah-legal-fg);
      font-size: 11px;
      letter-spacing: 0.04em;
      display: inline-flex; align-items: center; gap: 10px;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
    }
    html[data-bg="none"] .ah-chip-legal { padding: 4px 0; bottom: 28px; right: 28px; }
    .ah-chip-legal a {
      color: inherit; text-decoration: none;
      transition: color 140ms;
    }
    .ah-chip-legal a:hover { color: var(--ah-legal-fg-hover); }
    .ah-chip-legal .ah-sep { color: var(--ah-legal-sep); }

    /* ============= PHONE FOOTER BAR =============
       On a phone the corner chips have nowhere to float: the widget fills the
       screen, so a fixed pill either covers the form or gets dropped (which
       is what used to happen below 480px — terms and the trust mark vanished
       and the settings chip sat on top of the card). The footer collects the
       same four pieces into one strip along the bottom edge.

       Always in the DOM, revealed only under the mobile breakpoint, so the
       same markup serves both layouts with no user-agent sniffing. */
    .ah-footer {
      display: none;
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 20;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 12px;
      /* Clear the home indicator on notched phones. */
      padding-bottom: max(6px, env(safe-area-inset-bottom, 6px));
      background: var(--ah-footer-bg);
      border-top: 1px solid var(--ah-footer-border);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      color: var(--ah-footer-fg);
      font-size: 12px;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
    }
    .ah-footer-left, .ah-footer-right {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    /* Space is tight on a phone (a 375px bar has ~330px of usable width).
       Priority order when it runs out: the controls and the terms link hold
       their size, and the trust mark — decorative, and the only item that
       scales without becoming unreadable — shrinks to fit. */
    .ah-footer-left { flex: 1 1 auto; overflow: hidden; }
    .ah-footer-right { flex: 0 0 auto; }
    .ah-footer-trust { flex: 0 1 auto; min-width: 0; display: inline-flex; }
    .ah-footer-trust a { display: inline-flex; align-items: center; min-width: 0; }
    .ah-footer-trust img {
      display: block;
      max-width: 100%;
      height: auto;
      max-height: 14px;
      opacity: 0.8;
    }
    /* Below this the bar can't hold a logo and a legal link at a legible
       size, and the legal link is the one that has to stay. */
    @media (max-width: 359px) {
      .ah-footer-trust { display: none; }
    }
    .ah-footer-terms {
      flex: 0 0 auto;
      color: inherit;
      text-decoration: none;
      white-space: nowrap;
      transition: color 140ms;
    }
    .ah-footer-terms:hover { color: var(--ah-footer-fg-strong); }
    .ah-footer button,
    .ah-footer .ah-lang {
      background: 0; border: 0; padding: 7px 8px; cursor: pointer;
      color: inherit;
      font-size: 12px; font-weight: 500;
      min-height: 34px;
      border-radius: 10px;
      display: inline-flex; align-items: center; gap: 5px;
      transition: 140ms;
    }
    .ah-footer button:hover,
    .ah-footer .ah-lang:hover,
    .ah-footer button:focus-visible,
    .ah-footer .ah-lang:focus-within {
      color: var(--ah-footer-fg-strong);
      background: var(--ah-chip-active-bg);
    }
    /* The globe is redundant beside a language name and costs ~18px of a
       budget that doesn't have it — the chip keeps it, the footer doesn't. */
    .ah-footer .ah-lang > svg { display: none; }
    .ah-footer .ah-lang select {
      appearance: none; -webkit-appearance: none;
      background: transparent; color: inherit; border: 0;
      font: inherit; cursor: pointer; padding: 0;
      outline: 0;
    }

    /* ============= PER-SLOT CHIP STYLE OVERRIDES =============
       Templates can force a chip's surface via the slot tag's style arg
       (e.g. {%- authhero:legal style="plain" -%}). Without it chips follow
       the data-bg default (pill with a background image, plain on a solid
       background). These modifiers re-point the surface tokens directly on
       the element, so they win over the inherited data-bg values. */
    .ah-chip--pill {
      --ah-chip-bg:        var(--ah-chip-bg-pill);
      --ah-chip-bg-hover:  var(--ah-chip-bg-hover-pill);
      --ah-chip-border:    var(--ah-chip-border-pill);
      --ah-chip-logo-bg:   var(--ah-chip-logo-bg-pill);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .ah-chip-legal.ah-chip--pill { padding: 7px 14px; bottom: 24px; right: 24px; }

    .ah-chip--plain {
      --ah-chip-bg:        transparent;
      --ah-chip-bg-hover:  transparent;
      --ah-chip-border:    transparent;
      --ah-chip-logo-bg:   transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .ah-chip-legal.ah-chip--plain { padding: 4px 0; bottom: 28px; right: 28px; }

    /* ============= EXPLICIT DARK MODE FOR WIDGET =============
       The page-level dark/light is controlled by data-mode (above).
       The widget itself has its own --ah-color-* vars set via JS.
       html.ah-dark-mode is the legacy class kept for the widget toggle. */
    ${darkModeCssVarRules("html.ah-dark-mode authhero-widget", primaryColor || themePrimary)}
    @media (prefers-color-scheme: dark) {
      ${darkModeCssVarRules("html:not(.ah-light-mode) authhero-widget", primaryColor || themePrimary)}
    }

    /* ============= MOBILE =============
       Chrome chips minimize, and the card either floats on the page
       background image or fills the viewport when there isn't one — the
       two variants are emitted conditionally at the end of this block.

       The !important flags are load-bearing: the body-fragment path sets
       the body layout inline (see buildBodyLayout) and the widget
       container's width inline (see buildWidgetContainerStyle), and an
       inline declaration outranks a normal rule from this stylesheet.

       Below this width a page_layout of "left"/"right" collapses to
       centered: the 80px offset only reads as a deliberate composition when
       there's page background left over beside the widget. On a phone or a
       narrow window the offset just pushes a 400px card off-centre (and, at
       the low end, off-screen). */
    @media (max-width: 767px) {
      body { justify-content: center !important; padding: 20px !important; }
    }
    @media (max-width: 480px) {
      /* Column, so stretch runs horizontally and every in-flow wrapper
         inherits the body's width. The widths below are percentages, which
         need a definite containing block: body is otherwise a row flex box
         whose item is content-sized, so a custom template that wraps the
         widget in its own element makes the percentage cyclic and the card
         shrink-to-fits to min-content (243px on a 375px phone). Vertical
         centering carries over from the <=767px rule's justify-content. */
      body { flex-direction: column !important; align-items: stretch !important; }
      /* Full width in both variants: overrides the inline
         clamp(320px, 100%, 400px), which would otherwise hold the card at
         400px with stray gutters on a 400-480px phone. */
      .widget-container { width: 100% !important; }
      .ah-widget-stack { width: 100% !important; }
      /* Every corner chip gives way to the footer bar, which carries the
         same content in a strip that can't overlap the form. */
      .ah-chip, .ah-chip-legal { display: none; }
      .ah-footer { display: flex; }
    }
${
  hasBgImage
    ? `
    /* Phone, WITH a page background image — the card floats.

       The image is the tenant's branding; going full-bleed here would hide
       it entirely on the device most sign-ins come from. So the body keeps
       its background (no override), the tint overlay stays for chip
       legibility, and the card keeps a gutter so the image reads around it.
       The widget's own stylesheet is told to match via the \`floating\`
       attribute (see renderWidgetSSR). */
    @media (max-width: 480px) {
      /* Extra bottom padding keeps the floating card clear of the footer. */
      body { padding: 20px 20px 76px !important; }
      .ah-bg-tint { display: block; }
    }`
    : `
    /* Phone, NO page background image — the card fills the screen.

       With only a flat colour behind it there is nothing to show around the
       card, so it goes edge-to-edge and the page background collapses into
       the widget's own colour. Matches the widget stylesheet's default
       (non-\`floating\`) mobile layout. */
    @media (max-width: 480px) {
      body { background: ${widgetBackground} !important; padding: 0 !important; }
      html.ah-dark-mode body { background: #111827 !important; }
      .ah-bg-tint { display: none; }
      /* The full-bleed widget is exactly 100vh, so pad its bottom (a
         light-DOM rule on the host beats the :host rule in its shadow tree)
         to stop a tall form scrolling under the fixed footer. The footer's
         own bottom padding grows with the safe-area inset, so the clearance
         has to track it or the footer covers the last field on a notched
         phone — mirror that \`max()\` rather than hard-coding 60px. */
      authhero-widget {
        padding-bottom: calc(54px + max(6px, env(safe-area-inset-bottom, 6px)));
      }
    }`
}
  `;
}
