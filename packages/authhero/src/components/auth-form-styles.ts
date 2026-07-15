import { Theme, Branding } from "@authhero/adapter-interfaces";

type Style = Record<string, string | number>;

/**
 * Derived theme/branding styles shared by the universal-login auth forms.
 *
 * Every field is computed exactly as the forms did inline, so
 * {@link getThemeStyles} is a drop-in replacement that renders byte-identically.
 * `inputStyle` depends on whether the form is in an error state, so `error` is
 * passed in.
 */
export interface AuthFormStyles {
  primaryColor: string;
  primaryButtonLabel: string;
  bodyText: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  errorColor: string;
  widgetBackground: string;
  widgetBorder: string;
  borderRadius: number;
  inputBorderRadius: number;
  buttonBorderRadius: number;
  showShadow: boolean;
  titleSize: number;
  titleBold: boolean;
  bodySize: number;
  cardStyle: Style;
  titleStyle: Style;
  bodyStyle: Style;
  inputStyle: Style;
  buttonStyle: Style;
  logoPosition: string;
  logoAlignmentClass: string;
  logoUrl?: string;
  showLogo: string | false | undefined;
}

export function getThemeStyles(
  theme?: Theme | null,
  branding?: Branding | null,
  error?: string,
): AuthFormStyles {
  // Extract theme and branding colors (theme overrides branding)
  const primaryColor =
    theme?.colors?.primary_button || branding?.colors?.primary || "#0066cc";
  const primaryButtonLabel = theme?.colors?.primary_button_label || "#ffffff";
  const bodyText = theme?.colors?.body_text || "#333333";
  const inputBackground = theme?.colors?.input_background || "#ffffff";
  const inputBorder = theme?.colors?.input_border || "#d1d5db";
  const inputText = theme?.colors?.input_filled_text || "#111827";
  const errorColor = theme?.colors?.error || "#dc2626";
  const widgetBackground = theme?.colors?.widget_background || "#ffffff";
  const widgetBorder = theme?.colors?.widget_border || "#e5e7eb";

  // Extract border settings
  const borderRadius = theme?.borders?.widget_corner_radius || 8;
  const inputBorderRadius = theme?.borders?.input_border_radius || 4;
  const buttonBorderRadius = theme?.borders?.button_border_radius || 4;
  const showShadow = theme?.borders?.show_widget_shadow ?? true;

  // Extract font settings
  const titleSize = theme?.fonts?.title?.size || 24;
  const titleBold = theme?.fonts?.title?.bold ?? true;
  const bodySize = theme?.fonts?.body_text?.size || 14;

  // Build inline styles for theming
  const cardStyle = {
    backgroundColor: widgetBackground,
    borderColor: widgetBorder,
    borderRadius: `${borderRadius}px`,
    boxShadow: showShadow ? "0 1px 3px 0 rgba(0, 0, 0, 0.1)" : "none",
    color: bodyText,
  };

  const titleStyle = {
    fontSize: `${titleSize}px`,
    fontWeight: titleBold ? "700" : "400",
    color: theme?.colors?.header || bodyText,
  };

  const bodyStyle = {
    fontSize: `${bodySize}px`,
    color: theme?.colors?.input_labels_placeholders || "#6b7280",
  };

  const inputStyle = {
    backgroundColor: inputBackground,
    borderColor: error ? errorColor : inputBorder,
    borderRadius: `${inputBorderRadius}px`,
    color: inputText,
  };

  const buttonStyle = {
    backgroundColor: primaryColor,
    color: primaryButtonLabel,
    borderRadius: `${buttonBorderRadius}px`,
  };

  // Determine logo alignment based on theme
  const logoPosition = theme?.widget?.logo_position || "center";
  const logoAlignmentClass =
    logoPosition === "left"
      ? "text-left"
      : logoPosition === "right"
        ? "text-right"
        : "text-center";

  // Check if logo should be displayed
  const logoUrl = theme?.widget?.logo_url || branding?.logo_url;
  const showLogo = logoPosition !== "none" && logoUrl;

  return {
    primaryColor,
    primaryButtonLabel,
    bodyText,
    inputBackground,
    inputBorder,
    inputText,
    errorColor,
    widgetBackground,
    widgetBorder,
    borderRadius,
    inputBorderRadius,
    buttonBorderRadius,
    showShadow,
    titleSize,
    titleBold,
    bodySize,
    cardStyle,
    titleStyle,
    bodyStyle,
    inputStyle,
    buttonStyle,
    logoPosition,
    logoAlignmentClass,
    logoUrl,
    showLogo,
  };
}
