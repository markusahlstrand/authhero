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
import { BUILTIN_STRATEGIES } from "../strategies";

type Props = {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  loginSession: LoginSession;
  email?: string;
  client: EnrichedClient;
  className?: string;
  isEmbedded?: boolean;
  browserName?: string;
};

const IdentifierForm: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
  client,
  className,
  isEmbedded,
  browserName,
}) => {
  const connectionStrategies = client.connections.map(
    ({ strategy }) => strategy,
  );

  // Determine which input fields to show based on available connections
  const showEmailInput =
    connectionStrategies.includes("email") ||
    connectionStrategies.includes("Username-Password-Authentication");
  const showPhoneInput = connectionStrategies.includes("sms");

  // Strategies that are handled by form inputs, not social/enterprise buttons
  const formStrategies = new Set([
    "email",
    "sms",
    "Username-Password-Authentication",
    "auth0",
  ]);

  // Get all available social/enterprise connections with their configs
  const socialConnections = client.connections
    .filter((connection) => !formStrategies.has(connection.strategy))
    .filter((connection) => connection.show_as_button !== false)
    .map((connection) => {
      const strategy = BUILTIN_STRATEGIES[connection.strategy];
      if (!strategy) return null;

      return {
        ...strategy,
        connectionName: connection.name,
        // Use display_name if set, otherwise fall back to strategy displayName
        displayName:
          connection.display_name || strategy.displayName || connection.name,
        iconUrl: connection.options.icon_url,
      };
    })
    .filter((config): config is NonNullable<typeof config> => config !== null)
    .filter((config) => {
      // Filter out strategies that are disabled for embedded browsers
      if (isEmbedded && config.disableEmbeddedBrowsers) {
        return false;
      }
      return true;
    });

  // Check if any identifier input should be shown
  const showIdentifierInput = showEmailInput || showPhoneInput;

  // Configure input placeholder based on available connections
  const authMethodKey =
    showEmailInput && showPhoneInput
      ? "email_or_phone_placeholder"
      : showEmailInput
        ? "email_placeholder"
        : showPhoneInput
          ? "phone_placeholder"
          : null;

  const inputPlaceholder = authMethodKey
    ? i18next.t(
        authMethodKey,
        showEmailInput && showPhoneInput
          ? "Email or Phone Number"
          : showEmailInput
            ? "Email Address"
            : "Phone Number",
      )
    : "";

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
      <div
        id="incognito-warning-container"
        className="mb-4 hidden rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none">⚠️</span>
          <div>
            <strong>{i18next.t("incognito_mode_detected")}</strong>
            <p className="mt-1 text-xs opacity-90">
              {i18next.t("incognito_mode_warning")}
            </p>
          </div>
        </div>
      </div>
      {isEmbedded && (
        <div
          className="mb-4 rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-900/20 dark:text-orange-100"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none">⚠️</span>
            <div>
              <strong>{i18next.t("embedded_browser_detected")}</strong>
              <p className="mt-1 text-xs opacity-90">
                {i18next.t("embedded_browser_warning", {
                  browserName: browserName || "the app",
                })}
              </p>
            </div>
          </div>
        </div>
      )}
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
            {showIdentifierInput
              ? i18next.t("login_description_template", {
                  authMethod: i18next
                    .t(authMethodKey!, {
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
                })
              : i18next.t(
                  "login_description_social_only",
                  "Choose how to login",
                )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post">
            <div className="grid gap-6">
              {showIdentifierInput && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="username" style={bodyStyle}>
                      {i18next.t(
                        authMethodKey!,
                        showEmailInput && showPhoneInput
                          ? "Email or Phone Number"
                          : showEmailInput
                            ? "Email"
                            : "Phone Number",
                      )}
                    </Label>
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder={inputPlaceholder}
                      required
                      value={email || ""}
                      error={!!error}
                      className="border lowercase"
                      style={inputStyle}
                    />
                    {error && <ErrorMessage>{error}</ErrorMessage>}
                  </div>
                  <Button
                    type="submit"
                    className="w-full transition-colors hover:brightness-90"
                    style={buttonStyle}
                  >
                    {i18next.t("continue", "Continue")}
                  </Button>
                </>
              )}
              {socialConnections.length > 0 && (
                <>
                  {showIdentifierInput && (
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
                  )}
                  <div className="flex gap-4 sm:flex-col short:flex-row">
                    {socialConnections.map((config) => {
                      const Logo = config.logo;
                      return (
                        <a
                          key={config.connectionName}
                          href={`/authorize/redirect?state=${loginSession.id}&connection=${config.connectionName}`}
                          className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 border bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 h-10 px-4 py-2 w-full sm:w-full short:flex-1"
                          style={{
                            borderColor: inputBorder,
                            borderRadius: `${buttonBorderRadius}px`,
                            color: bodyText,
                          }}
                        >
                          <Logo className="h-5 w-5" iconUrl={config.iconUrl} />
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
