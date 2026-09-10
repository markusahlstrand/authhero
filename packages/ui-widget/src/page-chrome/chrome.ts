/**
 * Page chrome — the furniture around the widget card.
 *
 * Every renderer returns an HTML string rather than a JSX node. The authhero
 * page embeds these strings directly, and its Liquid custom-template pipeline
 * substitutes them into `{%- authhero:* -%}` slots (which already called
 * `.toString()` on the old JSX components, so the contract is unchanged).
 * Strings also let the widget's demo server render the identical chrome
 * without pulling in a JSX runtime.
 *
 * i18n is deliberately NOT resolved here — callers pass already-translated
 * labels (`termsLabel`, language display names). That keeps this module free
 * of authhero's i18n stack so the demo can use it too.
 *
 * Two chrome layouts share these fragments:
 *  - Floating corner chips (desktop) — fixed-position pills at the corners.
 *  - Footer bar (phones) — a single strip along the bottom of the viewport.
 * Both are always rendered; CSS decides which one is visible at a given
 * width, so no server-side user-agent sniffing is involved.
 */
import { escapeHtml, sanitizeUrl } from "./html";
import type { DarkModePreference, ChipStyle, LanguageOption } from "./types";

const DARK_MODE_TOGGLE_ONCLICK = `(function(btn){var h=document.documentElement;var cur=h.classList.contains('ah-dark-mode')?'dark':h.classList.contains('ah-light-mode')?'light':'auto';var next=cur==='auto'?'dark':cur==='dark'?'light':'auto';h.classList.remove('ah-dark-mode','ah-light-mode');if(next==='dark'){h.classList.add('ah-dark-mode');h.setAttribute('data-mode','dark')}else if(next==='light'){h.classList.add('ah-light-mode');h.setAttribute('data-mode','light')}else{h.removeAttribute('data-mode')}Array.prototype.forEach.call(document.querySelectorAll('[data-ah-dm]'),function(b){b.querySelector('.icon-sun').style.display=next==='light'?'block':'none';b.querySelector('.icon-moon').style.display=next==='dark'?'block':'none';b.querySelector('.icon-auto').style.display=next==='auto'?'block':'none'});document.cookie='ah-dark-mode='+next+';path=/;max-age=31536000;SameSite=Lax';if(window.__ahDarkMode){window.__ahDarkMode(next)}})(this)`;

const LANGUAGE_PICKER_ONCHANGE = `var p=new URLSearchParams(window.location.search);p.set('ui_locales',this.value);window.location.search=p.toString()`;

/** Modifier class that forces a chip's surface on/off (empty for "auto"). */
function chipVariantClass(variant?: ChipStyle): string {
  if (variant === "plain") return " ah-chip--plain";
  if (variant === "pill") return " ah-chip--pill";
  return "";
}

/** `style="display:none"` unless this icon matches the active mode. */
function iconDisplay(active: boolean): string {
  return active ? "" : ' style="display:none"';
}

const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

function globeSvg(size: number): string {
  return `<svg width="${size}" height="${size}" ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
}

/**
 * Dark-mode toggle: cycles auto -> dark -> light and swaps which of the three
 * icons is visible. `data-ah-dm` lets the inline handler find every instance
 * on the page, so the chip and the footer copy stay in sync when either is
 * clicked.
 */
export function renderDarkModeToggle(opts: {
  darkMode: DarkModePreference;
  size?: number;
}): string {
  const s = opts.size ?? 13;
  const { darkMode } = opts;
  return (
    `<button type="button" data-ah-dm aria-label="Toggle dark mode" onclick="${escapeHtml(DARK_MODE_TOGGLE_ONCLICK)}">` +
    `<svg class="icon-auto" width="${s}" height="${s}" ${SVG_ATTRS}${iconDisplay(darkMode === "auto")}><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor"/></svg>` +
    `<svg class="icon-sun" width="${s}" height="${s}" ${SVG_ATTRS}${iconDisplay(darkMode === "light")}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>` +
    `<svg class="icon-moon" width="${s}" height="${s}" ${SVG_ATTRS}${iconDisplay(darkMode === "dark")}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>` +
    `</button>`
  );
}

/**
 * Language picker. Returns "" for fewer than two languages — a select with a
 * single option is chrome that does nothing.
 */
export function renderLanguagePicker(opts: {
  language?: string;
  languages: LanguageOption[];
  size?: number;
}): string {
  const { language, languages } = opts;
  if (!languages || languages.length < 2) return "";
  const options = languages
    .map(
      (l) =>
        `<option value="${escapeHtml(l.value)}"${l.value === language ? " selected" : ""}>${escapeHtml(l.label)}</option>`,
    )
    .join("");
  return (
    `<div class="ah-lang">${globeSvg(opts.size ?? 13)}` +
    `<select aria-label="Language" onchange="${escapeHtml(LANGUAGE_PICKER_ONCHANGE)}">${options}</select>` +
    `</div>`
  );
}

/** Top-left logo chip. Only rendered when the caller opts into the chip variant. */
export function renderLogoChip(opts: {
  logoUrl?: string | null;
  clientName: string;
  variant?: ChipStyle;
}): string {
  const safe = opts.logoUrl ? sanitizeUrl(opts.logoUrl) : "";
  const inner = safe
    ? `<img src="${safe}" alt="${escapeHtml(opts.clientName)}">`
    : `<span class="ah-logo-text">${escapeHtml(opts.clientName)}</span>`;
  return `<div class="ah-chip ah-chip-logo${chipVariantClass(opts.variant)}" data-ah-slot="top-left">${inner}</div>`;
}

/** Top-right settings chip: dark-mode toggle plus the language picker. */
export function renderSettingsChip(opts: {
  darkMode: DarkModePreference;
  language?: string;
  languages?: LanguageOption[];
  variant?: ChipStyle;
}): string {
  const picker = opts.languages
    ? renderLanguagePicker({
        language: opts.language,
        languages: opts.languages,
      })
    : "";
  return (
    `<div class="ah-chip ah-chip-settings${chipVariantClass(opts.variant)}" data-ah-slot="top-right">` +
    renderDarkModeToggle({ darkMode: opts.darkMode }) +
    picker +
    `</div>`
  );
}

/** Bottom-left "powered by" trust mark. */
export function renderPoweredByChip(opts: {
  url: string;
  href?: string;
  alt?: string;
  height?: number;
  variant?: ChipStyle;
}): string {
  const safeUrl = sanitizeUrl(opts.url);
  if (!safeUrl) return "";
  const safeHref = opts.href ? sanitizeUrl(opts.href) : "";
  const img = `<img src="${safeUrl}" alt="${escapeHtml(opts.alt || "")}" height="${opts.height || 18}">`;
  const inner = safeHref
    ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${img}</a>`
    : img;
  return `<div class="ah-chip ah-chip-trust${chipVariantClass(opts.variant)}" data-ah-slot="bottom-left">${inner}</div>`;
}

/** Bottom-right terms/privacy link. `termsLabel` arrives already translated. */
export function renderLegalChip(opts: {
  termsAndConditionsUrl?: string;
  termsLabel: string;
  variant?: ChipStyle;
}): string {
  if (!opts.termsAndConditionsUrl) return "";
  const href = sanitizeUrl(opts.termsAndConditionsUrl);
  if (!href) return "";
  return (
    `<div class="ah-chip-legal${chipVariantClass(opts.variant)}" data-ah-slot="bottom-right">` +
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(opts.termsLabel)}</a>` +
    `</div>`
  );
}

/**
 * Phone footer bar.
 *
 * On a phone the corner chips have nowhere to float: the widget fills the
 * screen, so a fixed pill either overlaps the form or gets hidden (which is
 * what used to happen — terms and the trust mark were simply dropped below
 * 480px, and the settings chip sat on top of the card). This collects the
 * same four pieces into one strip pinned to the bottom of the viewport.
 *
 * Rendered on every page but only displayed under the mobile breakpoint, so
 * the same HTML serves both layouts and nothing depends on user-agent
 * sniffing. Returns "" when there is nothing to put in it.
 */
export function renderMobileFooter(opts: {
  darkMode: DarkModePreference;
  language?: string;
  languages?: LanguageOption[];
  termsAndConditionsUrl?: string;
  termsLabel: string;
  poweredBy?: { url: string; href?: string; alt?: string; height?: number };
}): string {
  const termsHref = opts.termsAndConditionsUrl
    ? sanitizeUrl(opts.termsAndConditionsUrl)
    : "";
  const terms = termsHref
    ? `<a class="ah-footer-terms" href="${termsHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(opts.termsLabel)}</a>`
    : "";

  let poweredBy = "";
  if (opts.poweredBy) {
    const safeUrl = sanitizeUrl(opts.poweredBy.url);
    if (safeUrl) {
      const img = `<img src="${safeUrl}" alt="${escapeHtml(opts.poweredBy.alt || "")}" height="${opts.poweredBy.height || 14}">`;
      const safeHref = opts.poweredBy.href
        ? sanitizeUrl(opts.poweredBy.href)
        : "";
      poweredBy = `<span class="ah-footer-trust">${
        safeHref
          ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${img}</a>`
          : img
      }</span>`;
    }
  }

  const picker = opts.languages
    ? renderLanguagePicker({
        language: opts.language,
        languages: opts.languages,
        size: 14,
      })
    : "";
  const controls =
    renderDarkModeToggle({ darkMode: opts.darkMode, size: 14 }) + picker;

  // Nothing to show — don't emit an empty bar taking up 48px of a phone.
  // `controls` counts towards "something to show": it carries the dark-mode
  // toggle, and the phone layout hides the corner settings chip, so dropping
  // the footer here would leave the device with no way to switch theme.
  if (!terms && !poweredBy && !controls) return "";

  return (
    `<footer class="ah-footer" data-ah-slot="footer">` +
    `<div class="ah-footer-left">${poweredBy}${terms}</div>` +
    `<div class="ah-footer-right">${controls}</div>` +
    `</footer>`
  );
}
