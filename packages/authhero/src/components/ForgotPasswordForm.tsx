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
  email?: string;
  client: EnrichedClient;
  className?: string;
};

const ForgotPasswordForm: FC<Props> = ({
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
            {i18next.t("forgot_password_title", "Forgot Password")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            {i18next.t(
              "forgot_password_description",
              "Enter your email address and we'll send you a link to reset your password.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" className="space-y-4">
            <input
              type="hidden"
              name="state"
              value={loginSession.authParams.state}
            />

            <div className="space-y-2">
              <Label
                htmlFor="username"
                style={bodyStyle}
                className="text-sm font-medium"
              >
                {i18next.t("email_label", "Email")}
              </Label>
              <Input
                id="username"
                type="email"
                name="username"
                placeholder={i18next.t("email_placeholder", "Email Address")}
                value={email}
                disabled={!!email}
                style={inputStyle}
                className="w-full"
                required
              />
            </div>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <Button
              type="submit"
              className="w-full"
              style={buttonStyle}
              disabled={false}
            >
              {i18next.t("forgot_password_cta", "Send Reset Link")}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <a
              href={`/u/login/identifier?state=${encodeURIComponent(loginSession.authParams.state || "")}`}
              className="text-sm"
              style={{ color: primaryColor }}
            >
              {i18next.t("back_to_login", "Back to Login")}
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPasswordForm;
