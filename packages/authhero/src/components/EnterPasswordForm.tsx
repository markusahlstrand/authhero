import type { FC } from "hono/jsx";
import {
  LoginSession,
  Theme,
  Branding,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import cn from "classnames";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import Input from "./ui/input";
import Button from "./ui/button";
import Label from "./ui/label";
import ErrorMessage from "./ErrorMessage";
import AppLogo from "./AppLogo";

type Props = {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  loginSession: LoginSession;
  email: string;
  client: EnrichedClient;
  className?: string;
};

const EnterPasswordForm: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
  className,
}) => {
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

  return (
    <div className={cn("flex flex-col gap-6 w-full max-w-sm", className)}>
      <Card style={cardStyle} className="border">
        <CardHeader>
          {showLogo && (
            <div className={cn("mb-4", logoAlignmentClass)}>
              <AppLogo theme={theme} branding={branding} />
            </div>
          )}
          <CardTitle style={titleStyle}>
            {i18next.t("enter_password", "Enter your password")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            {i18next.t(
              "enter_password_description",
              "Enter your password to continue",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post">
            <div className="grid gap-6">
              {/* Email Field (read-only) */}
              <div className="grid gap-2">
                <Label htmlFor="email" style={bodyStyle}>
                  {i18next.t("email", "Email")}
                </Label>
                <Input
                  id="email"
                  name="username"
                  type="email"
                  value={email}
                  disabled
                  className="border bg-gray-50"
                  style={{ ...inputStyle, cursor: "not-allowed" }}
                />
              </div>

              {/* Password Field with Toggle */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" style={bodyStyle}>
                    {i18next.t("password", "Password")}
                  </Label>
                  <a
                    href={`/u/forgot-password?state=${loginSession.id}`}
                    className="text-sm hover:underline"
                    style={{ color: primaryColor }}
                  >
                    {i18next.t("forgot_password", "Forgot password?")}
                  </a>
                </div>

                {/* Password input with toggle - uses data attributes for client-side hydration */}
                <div className="relative" data-password-toggle>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    data-password-input="password"
                    placeholder={i18next.t(
                      "password_placeholder",
                      "Enter your password",
                    )}
                    required
                    error={!!error}
                    className="border pr-8"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    data-password-toggle-btn
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label={i18next.t(
                      "toggle_password_visibility",
                      "Toggle password visibility",
                    )}
                  >
                    {/* Eye icon (show password) */}
                    <svg
                      data-show-icon
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {/* Eye-off icon (hide password) - hidden by default */}
                    <svg
                      data-hide-icon
                      className="hidden"
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  </button>
                </div>

                {error && <ErrorMessage>{error}</ErrorMessage>}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full transition-colors hover:brightness-90"
                style={buttonStyle}
              >
                {i18next.t("continue", "Continue")}
              </Button>

              {/* Back Link */}
              <div className="text-center">
                <a
                  href={`/u/login/identifier?state=${loginSession.id}`}
                  className="text-sm hover:underline"
                  style={bodyStyle}
                >
                  ← {i18next.t("back", "Back")}
                </a>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnterPasswordForm;
