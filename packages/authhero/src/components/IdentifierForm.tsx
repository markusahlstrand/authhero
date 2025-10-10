import type { FC } from "hono/jsx";
import {
  LegacyClient,
  LoginSession,
  Theme,
  Branding,
} from "@authhero/adapter-interfaces";
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
import { getSocialStrategy } from "../strategies";

type Props = {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  loginSession: LoginSession;
  email?: string;
  client: LegacyClient;
  className?: string;
};

const IdentifierForm: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
  client,
  className,
}) => {
  const connections = client.connections.map(({ strategy }) => strategy);

  // Determine which input fields to show based on available connections
  const showEmailInput =
    connections.includes("email") ||
    connections.includes("Username-Password-Authentication");
  const showPhoneInput = connections.includes("sms");

  // Get all available social connections with their configs
  const socialConnections = connections
    .map((strategyName) => {
      const strategy = getSocialStrategy(strategyName);
      return strategy ? { name: strategyName, ...strategy } : null;
    })
    .filter((config): config is NonNullable<typeof config> => config !== null);

  // Configure input placeholder based on available connections
  const authMethodKey =
    showEmailInput && showPhoneInput
      ? "email_or_phone_placeholder"
      : showEmailInput
        ? "email_placeholder"
        : "phone_placeholder";

  const inputPlaceholder = i18next.t(
    authMethodKey,
    showEmailInput && showPhoneInput
      ? "Email or Phone Number"
      : showEmailInput
        ? "Email Address"
        : "Phone Number",
  );

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

  const buttonHoverStyle = {
    backgroundColor: theme?.colors?.base_hover_color || "#0052a3",
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
            {i18next.t("welcome", "Login")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            {i18next.t("login_description_template", {
              authMethod: i18next
                .t(authMethodKey, {
                  defaultValue:
                    showEmailInput && showPhoneInput
                      ? "email or phone number"
                      : showEmailInput
                        ? "email address"
                        : "phone number",
                })
                .toLocaleLowerCase(),
              defaultValue:
                "Enter your {{authMethod}} below to login to your account",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post">
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label htmlFor="username" style={bodyStyle}>
                  {i18next.t(authMethodKey, "Email")}
                </Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder={inputPlaceholder}
                  required
                  value={email || ""}
                  error={!!error}
                  className="border"
                  style={inputStyle}
                />
                {error && <ErrorMessage>{error}</ErrorMessage>}
              </div>
              <Button
                type="submit"
                className="w-full transition-colors"
                style={buttonStyle}
                onmouseover={`this.style.backgroundColor='${buttonHoverStyle.backgroundColor}'`}
                onmouseout={`this.style.backgroundColor='${buttonStyle.backgroundColor}'`}
              >
                {i18next.t("continue", "Continue")}
              </Button>
              {socialConnections.length > 0 && (
                <>
                  <div
                    className="relative text-center"
                    style={{
                      color:
                        theme?.colors?.input_labels_placeholders || "#6b7280",
                      fontSize: `${bodySize}px`,
                    }}
                  >
                    <div
                      className="absolute left-0 right-0 top-1/2 border-b"
                      style={{ borderColor: widgetBorder }}
                    />
                    <div
                      className="relative inline-block px-2"
                      style={{ backgroundColor: widgetBackground }}
                    >
                      {i18next.t("or", "Or")}
                    </div>
                  </div>
                  <div className="flex gap-4 sm:flex-col short:flex-row">
                    {socialConnections.map((config) => {
                      const Logo = config.logo;
                      return (
                        <a
                          key={config.name}
                          href={`/authorize/redirect?state=${loginSession.id}&connection=${config.name}`}
                          className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 border bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 h-10 px-4 py-2 w-full sm:w-full short:flex-1"
                          style={{
                            borderColor: inputBorder,
                            borderRadius: `${buttonBorderRadius}px`,
                            color: bodyText,
                          }}
                        >
                          <Logo className="h-5 w-5" />
                          <span className="sm:inline short:hidden">
                            {i18next.t(
                              "continue_with",
                              "Login with {{provider}}",
                              {
                                provider: config.displayName,
                              },
                            )}
                          </span>
                          <span className="hidden short:inline">
                            {config.displayName}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default IdentifierForm;
