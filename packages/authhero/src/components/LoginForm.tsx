import type { FC } from "hono/jsx";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import cn from "classnames";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./ui/card";
import Button from "./ui/button";
import Label from "./ui/label";
import Input from "./ui/input";
import AppLogo from "./AppLogo";
import ErrorMessage from "./ErrorMessage";

export interface LoginFormProps {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  state: string;
  email: string;
  client: EnrichedClient;
  className?: string;
  showCodeOption?: boolean;
}

const LoginForm: FC<LoginFormProps> = ({
  error,
  theme,
  branding,
  state,
  email,
  className,
  showCodeOption = true,
}) => {
  // Extract theme and branding colors (theme overrides branding)
  const primaryColor =
    theme?.colors?.primary_button || branding?.colors?.primary || "#0066cc";
  const primaryButtonLabel = theme?.colors?.primary_button_label || "#ffffff";
  const bodyText = theme?.colors?.body_text || "#333333";
  const inputBorder = theme?.colors?.input_border || "#d1d5db";
  const widgetBackground = theme?.colors?.widget_background || "#ffffff";
  const widgetBorder = theme?.colors?.widget_border || "#e5e7eb";

  // Extract border settings
  const borderRadius = theme?.borders?.widget_corner_radius || 8;
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

  const buttonStyle = {
    backgroundColor: primaryColor,
    color: primaryButtonLabel,
    borderRadius: `${buttonBorderRadius}px`,
  };

  const secondaryButtonStyle = {
    backgroundColor: "transparent",
    color: bodyText,
    borderColor: inputBorder,
    borderRadius: `${buttonBorderRadius}px`,
  };

  const linkStyle = {
    color: theme?.colors?.links_focused_components || primaryColor,
    fontSize: `${bodySize}px`,
  };

  const inputStyle = {
    borderColor: inputBorder,
    borderRadius: `${buttonBorderRadius}px`,
    fontSize: `${bodySize}px`,
    color: bodyText,
    backgroundColor: widgetBackground,
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
              "Please enter your password to continue",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post">
            <div className="space-y-4">
              {/* Email field (read-only) */}
              <div className="space-y-2">
                <Label htmlFor="username" style={bodyStyle}>
                  {i18next.t("email", "Email")}
                </Label>
                <Input
                  type="text"
                  id="username"
                  name="username"
                  value={email}
                  disabled
                  style={inputStyle}
                  className="w-full bg-gray-50 dark:bg-gray-800"
                />
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label htmlFor="password" style={bodyStyle}>
                  {i18next.t("password", "Password")}
                </Label>
                <Input
                  type="password"
                  id="password"
                  name="password"
                  placeholder={i18next.t(
                    "enter_your_password",
                    "Enter your password",
                  )}
                  required
                  style={inputStyle}
                  className="w-full"
                />
              </div>

              {error && <ErrorMessage>{error}</ErrorMessage>}

              {/* Login button */}
              <Button
                type="submit"
                className="w-full transition-colors hover:brightness-90"
                style={buttonStyle}
              >
                {i18next.t("login", "Login")}
              </Button>

              {/* Forgot password link */}
              <div className="text-center">
                <a
                  href={`/u/forgot-password?state=${encodeURIComponent(state)}`}
                  className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors"
                  style={linkStyle}
                >
                  {i18next.t("forgot_password_link", "Forgot password?")}
                </a>
              </div>
            </div>
          </form>

          {/* Code option */}
          {showCodeOption && (
            <>
              {/* Divider */}
              <div className="relative mt-4">
                <div
                  className="absolute inset-0 flex items-center"
                  aria-hidden="true"
                >
                  <div
                    className="w-full border-t"
                    style={{ borderColor: widgetBorder }}
                  />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span
                    className="px-2"
                    style={{
                      backgroundColor: widgetBackground,
                      ...bodyStyle,
                    }}
                  >
                    {i18next.t("or", "Or")}
                  </span>
                </div>
              </div>

              {/* Enter code button */}
              <form
                method="post"
                action={`/u/login/identifier?state=${encodeURIComponent(state)}`}
                className="mt-4"
              >
                <input type="hidden" name="login_selection" value="code" />
                <input type="hidden" name="username" value={email} />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full transition-colors border"
                  style={secondaryButtonStyle}
                >
                  {i18next.t("enter_a_code_btn", "Email me a code instead")}
                </Button>
              </form>
            </>
          )}
        </CardContent>
        <CardFooter>
          <a
            href={`/u/login/identifier?state=${encodeURIComponent(state)}`}
            className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors w-full text-center"
            style={linkStyle}
          >
            {i18next.t("go_back", "Go back")}
          </a>
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginForm;
