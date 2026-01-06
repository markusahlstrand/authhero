/**
 * AuthHero Widget - Branding Utilities
 *
 * Converts AuthHero branding and theme configurations to CSS custom properties.
 */

/**
 * Branding configuration from AuthHero API (simplified for widget)
 */
export interface WidgetBranding {
  colors?: {
    primary?: string;
    page_background?: {
      type?: string;
      start?: string;
      end?: string;
      angle_deg?: number;
    };
  };
  logo_url?: string;
  favicon_url?: string;
  powered_by_logo_url?: string;
  font?: {
    url?: string;
  };
}

/**
 * Theme configuration from AuthHero API
 */
export interface WidgetTheme {
  borders?: {
    button_border_radius?: number;
    button_border_weight?: number;
    buttons_style?: 'pill' | 'rounded' | 'sharp';
    input_border_radius?: number;
    input_border_weight?: number;
    inputs_style?: 'pill' | 'rounded' | 'sharp';
    show_widget_shadow?: boolean;
    widget_border_weight?: number;
    widget_corner_radius?: number;
  };
  colors?: {
    base_focus_color?: string;
    base_hover_color?: string;
    body_text?: string;
    captcha_widget_theme?: 'auto' | 'dark' | 'light';
    error?: string;
    header?: string;
    icons?: string;
    input_background?: string;
    input_border?: string;
    input_filled_text?: string;
    input_labels_placeholders?: string;
    links_focused_components?: string;
    primary_button?: string;
    primary_button_label?: string;
    secondary_button_border?: string;
    secondary_button_label?: string;
    success?: string;
    widget_background?: string;
    widget_border?: string;
  };
  fonts?: {
    body_text?: { bold?: boolean; size?: number };
    buttons_text?: { bold?: boolean; size?: number };
    font_url?: string;
    input_labels?: { bold?: boolean; size?: number };
    links?: { bold?: boolean; size?: number };
    links_style?: 'normal' | 'underlined';
    reference_text_size?: number;
    subtitle?: { bold?: boolean; size?: number };
    title?: { bold?: boolean; size?: number };
  };
  page_background?: {
    background_color?: string;
    background_image_url?: string;
    page_layout?: 'center' | 'left' | 'right';
  };
  widget?: {
    header_text_alignment?: 'center' | 'left' | 'right';
    logo_height?: number;
    logo_position?: 'center' | 'left' | 'none' | 'right';
    logo_url?: string;
    social_buttons_layout?: 'bottom' | 'top';
  };
}

/**
 * Convert a style enum to border radius value
 */
function styleToRadius(style?: 'pill' | 'rounded' | 'sharp', baseRadius?: number): string | undefined {
  if (baseRadius !== undefined) return `${baseRadius}px`;
  switch (style) {
    case 'pill':
      return '9999px';
    case 'rounded':
      return '8px';
    case 'sharp':
      return '0';
    default:
      return undefined;
  }
}

/**
 * Convert branding configuration to CSS custom properties
 */
export function brandingToCssVars(branding?: WidgetBranding): Record<string, string> {
  if (!branding) return {};

  const vars: Record<string, string> = {};

  // Primary color
  if (branding.colors?.primary) {
    vars['--ah-color-primary'] = branding.colors.primary;
    // Generate hover variant (slightly darker)
    vars['--ah-color-primary-hover'] = branding.colors.primary;
  }

  // Page background
  if (branding.colors?.page_background) {
    const bg = branding.colors.page_background;
    if (bg.type === 'solid' && bg.start) {
      vars['--ah-page-bg'] = bg.start;
    } else if (bg.type === 'gradient' && bg.start && bg.end) {
      const angle = bg.angle_deg ?? 180;
      vars['--ah-page-bg'] = `linear-gradient(${angle}deg, ${bg.start}, ${bg.end})`;
    }
  }

  // Logo URL (stored for reference, used via prop)
  if (branding.logo_url) {
    vars['--ah-logo-url'] = `url(${branding.logo_url})`;
  }

  // Font URL
  if (branding.font?.url) {
    vars['--ah-font-url'] = branding.font.url;
  }

  return vars;
}

/**
 * Convert theme configuration to CSS custom properties
 */
export function themeToCssVars(theme?: WidgetTheme): Record<string, string> {
  if (!theme) return {};

  const vars: Record<string, string> = {};

  // Border radii
  if (theme.borders) {
    const b = theme.borders;

    // Widget
    if (b.widget_corner_radius !== undefined) {
      vars['--ah-widget-radius'] = `${b.widget_corner_radius}px`;
    }
    if (b.widget_border_weight !== undefined) {
      vars['--ah-widget-border-width'] = `${b.widget_border_weight}px`;
    }
    if (b.show_widget_shadow === false) {
      vars['--ah-widget-shadow'] = 'none';
    }

    // Buttons
    const btnRadius = styleToRadius(b.buttons_style, b.button_border_radius);
    if (btnRadius) {
      vars['--ah-btn-radius'] = btnRadius;
    }
    if (b.button_border_weight !== undefined) {
      vars['--ah-btn-border-width'] = `${b.button_border_weight}px`;
    }

    // Inputs
    const inputRadius = styleToRadius(b.inputs_style, b.input_border_radius);
    if (inputRadius) {
      vars['--ah-input-radius'] = inputRadius;
    }
    if (b.input_border_weight !== undefined) {
      vars['--ah-input-border-width'] = `${b.input_border_weight}px`;
    }
  }

  // Colors
  if (theme.colors) {
    const c = theme.colors;

    // Primary button
    if (c.primary_button) {
      vars['--ah-color-primary'] = c.primary_button;
      vars['--ah-color-primary-hover'] = c.primary_button;
    }
    if (c.primary_button_label) {
      vars['--ah-btn-primary-text'] = c.primary_button_label;
    }

    // Secondary button
    if (c.secondary_button_border) {
      vars['--ah-btn-secondary-border'] = c.secondary_button_border;
    }
    if (c.secondary_button_label) {
      vars['--ah-btn-secondary-text'] = c.secondary_button_label;
    }

    // Text colors
    if (c.body_text) {
      vars['--ah-color-text'] = c.body_text;
    }
    if (c.header) {
      vars['--ah-color-text-header'] = c.header;
    }
    if (c.input_labels_placeholders) {
      vars['--ah-color-text-label'] = c.input_labels_placeholders;
      vars['--ah-color-text-muted'] = c.input_labels_placeholders;
    }
    if (c.input_filled_text) {
      vars['--ah-color-input-text'] = c.input_filled_text;
    }

    // Backgrounds
    if (c.widget_background) {
      vars['--ah-color-bg'] = c.widget_background;
    }
    if (c.input_background) {
      vars['--ah-color-input-bg'] = c.input_background;
    }

    // Borders
    if (c.widget_border) {
      vars['--ah-widget-border-color'] = c.widget_border;
    }
    if (c.input_border) {
      vars['--ah-color-border'] = c.input_border;
    }

    // Links
    if (c.links_focused_components) {
      vars['--ah-color-link'] = c.links_focused_components;
    }

    // Focus/hover
    if (c.base_focus_color) {
      vars['--ah-color-focus-ring'] = c.base_focus_color;
    }
    if (c.base_hover_color) {
      vars['--ah-color-primary-hover'] = c.base_hover_color;
    }

    // Semantic colors
    if (c.error) {
      vars['--ah-color-error'] = c.error;
    }
    if (c.success) {
      vars['--ah-color-success'] = c.success;
    }

    // Icons
    if (c.icons) {
      vars['--ah-color-icon'] = c.icons;
    }
  }

  // Fonts
  if (theme.fonts) {
    const f = theme.fonts;
    // reference_text_size is the base font size in pixels (default 16px)
    const baseSize = f.reference_text_size || 16;

    if (f.font_url) {
      vars['--ah-font-url'] = f.font_url;
    }
    if (f.reference_text_size) {
      vars['--ah-font-size-base'] = `${f.reference_text_size}px`;
    }
    // Title, subtitle, etc. sizes are percentages of the base size
    if (f.title?.size) {
      const titlePx = Math.round((f.title.size / 100) * baseSize);
      vars['--ah-font-size-title'] = `${titlePx}px`;
    }
    if (f.subtitle?.size) {
      const subtitlePx = Math.round((f.subtitle.size / 100) * baseSize);
      vars['--ah-font-size-subtitle'] = `${subtitlePx}px`;
    }
    if (f.body_text?.size) {
      const bodyPx = Math.round((f.body_text.size / 100) * baseSize);
      vars['--ah-font-size-body'] = `${bodyPx}px`;
    }
    if (f.input_labels?.size) {
      const labelPx = Math.round((f.input_labels.size / 100) * baseSize);
      vars['--ah-font-size-label'] = `${labelPx}px`;
    }
    if (f.buttons_text?.size) {
      const btnPx = Math.round((f.buttons_text.size / 100) * baseSize);
      vars['--ah-font-size-btn'] = `${btnPx}px`;
    }
    if (f.links?.size) {
      const linkPx = Math.round((f.links.size / 100) * baseSize);
      vars['--ah-font-size-link'] = `${linkPx}px`;
    }
    if (f.links_style === 'underlined') {
      vars['--ah-link-decoration'] = 'underline';
    }

    // Font weights - bold option sets font-weight to 700
    if (f.title?.bold !== undefined) {
      vars['--ah-font-weight-title'] = f.title.bold ? '700' : '400';
    }
    if (f.subtitle?.bold !== undefined) {
      vars['--ah-font-weight-subtitle'] = f.subtitle.bold ? '700' : '400';
    }
    if (f.body_text?.bold !== undefined) {
      vars['--ah-font-weight-body'] = f.body_text.bold ? '700' : '400';
    }
    if (f.input_labels?.bold !== undefined) {
      vars['--ah-font-weight-label'] = f.input_labels.bold ? '700' : '400';
    }
    if (f.buttons_text?.bold !== undefined) {
      vars['--ah-font-weight-btn'] = f.buttons_text.bold ? '600' : '400';
    }
    if (f.links?.bold !== undefined) {
      vars['--ah-font-weight-link'] = f.links.bold ? '700' : '400';
    }
  }

  // Widget settings
  if (theme.widget) {
    const w = theme.widget;

    if (w.header_text_alignment) {
      vars['--ah-title-align'] = w.header_text_alignment;
    }
    if (w.logo_height) {
      vars['--ah-logo-height'] = `${w.logo_height}px`;
    }
    if (w.logo_position) {
      const positionMap: Record<string, string> = {
        center: 'center',
        left: 'flex-start',
        right: 'flex-end',
      };
      if (w.logo_position === 'none') {
        vars['--ah-logo-display'] = 'none';
      } else {
        vars['--ah-logo-align'] = positionMap[w.logo_position] ?? 'center';
      }
    }
    if (w.social_buttons_layout) {
      // 'top' means social buttons above fields, 'bottom' means below
      // Divider is always order 1 (middle)
      if (w.social_buttons_layout === 'top') {
        vars['--ah-social-order'] = '0';
        vars['--ah-divider-order'] = '1';
        vars['--ah-fields-order'] = '2';
      } else {
        vars['--ah-social-order'] = '2';
        vars['--ah-divider-order'] = '1';
        vars['--ah-fields-order'] = '0';
      }
    }
  }

  // Page background
  if (theme.page_background) {
    const pb = theme.page_background;
    if (pb.background_color) {
      vars['--ah-page-bg'] = pb.background_color;
    }
    if (pb.background_image_url) {
      vars['--ah-page-bg-image'] = `url(${pb.background_image_url})`;
    }
  }

  return vars;
}

/**
 * Merge branding and theme into a single CSS variables object
 */
export function mergeThemeVars(
  branding?: WidgetBranding,
  theme?: WidgetTheme
): Record<string, string> {
  return {
    ...brandingToCssVars(branding),
    ...themeToCssVars(theme),
  };
}

/**
 * Apply CSS variables to an element's style
 */
export function applyCssVars(
  element: HTMLElement,
  vars: Record<string, string>
): void {
  Object.entries(vars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}
