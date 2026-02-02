import type { FC } from "hono/jsx";
import {
  LoginSession,
  Theme,
  Branding,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import Layout from "./Layout";
import i18next from "i18next";
import cn from "classnames";
import Icon from "./Icon";
import ErrorMessage from "./ErrorMessage";
import SocialButton from "./SocialButton";
import FormComponent from "./Form";
import Button from "./Button";
import { BUILTIN_STRATEGIES } from "../strategies";

type Props = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  loginSession: LoginSession;
  email?: string;
  client: EnrichedClient;
  isEmbedded?: boolean;
  browserName?: string;
};

const IdentifierPage: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
  client,
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

  // Determine if any auth form should be shown
  const showForm = showEmailInput || showPhoneInput;

  // Configure input type and placeholder based on available connections
  let inputType = "text";
  let inputName = "username"; // Always use username as the input name

  // Determine which auth method text to use
  const authMethodKey =
    showEmailInput && showPhoneInput
      ? "email_or_phone_placeholder"
      : showEmailInput
        ? "email_placeholder"
        : "phone_placeholder";

  let inputPlaceholder = i18next.t(
    authMethodKey,
    showEmailInput && showPhoneInput
      ? "Email or Phone Number"
      : showEmailInput
        ? "Email Address"
        : "Phone Number",
  );

  // Determine login description text based on available connections
  const authMethodTemplateKey = "login_description_template";

  return (
    <Layout
      title={i18next.t("welcome")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div
        id="incognito-warning-container"
        className="mb-4 hidden rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none">⚠️</span>
          <div>
            <strong>
              {i18next.t("incognito_mode_detected", "Incognito Mode Detected")}
            </strong>
            <p className="mt-1 text-xs opacity-90">
              {i18next.t(
                "incognito_mode_warning",
                "You are in incognito/private mode. Session data may not persist across page refreshes. Some features might not work as expected.",
              )}
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
                  browserName: browserName || "app",
                })}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("welcome")}
      </div>
      <div className="mb-8 text-gray-300">
        {showForm
          ? i18next.t(authMethodTemplateKey, {
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
              defaultValue: "Sign in with your {{authMethod}}",
            })
          : i18next.t("login_description_social_only", "Choose how to login")}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        {showForm && (
          <FormComponent className="mb-7">
            <input
              type={inputType}
              name={inputName}
              placeholder={inputPlaceholder}
              className={cn(
                "mb-2 w-full rounded-lg border bg-gray-100 px-4 py-5 text-base lowercase placeholder:normal-case placeholder:text-gray-300 dark:bg-gray-600 md:text-base",
                {
                  "border-red": error,
                  "border-gray-100 dark:border-gray-500": !error,
                },
              )}
              required
              value={email || ""}
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <Button className="sm:mt-4 !text-base">
              <span>{i18next.t("continue")}</span>
              <Icon className="text-xs" name="arrow-right" />
            </Button>
          </FormComponent>
        )}
        {showForm && socialConnections.length > 0 && (
          <div className="relative mb-5 block text-center text-gray-300 dark:text-gray-300">
            <div className="absolute left-0 right-0 top-1/2 border-b border-gray-200 dark:border-gray-600" />
            <div className="relative inline-block bg-white px-2 dark:bg-gray-800">
              {i18next.t("continue_social_login")}
            </div>
          </div>
        )}
        <div className="flex space-x-4 sm:flex-col sm:space-x-0 sm:space-y-4 short:flex-row short:space-x-4 short:space-y-0">
          {socialConnections.map((config) => {
            const Logo = config.logo;
            return (
              <SocialButton
                key={config.connectionName}
                connection={config.connectionName}
                text={i18next.t("continue_with", {
                  provider: config.displayName,
                })}
                canResize={true}
                icon={
                  <Logo
                    className="h-5 w-5 sm:absolute sm:left-4 sm:top-1/2 sm:h-6 sm:w-6 sm:-translate-y-1/2 short:static short:left-auto short:top-auto short:h-5 short:w-5 short:translate-y-0"
                    iconUrl={config.iconUrl}
                  />
                }
                loginSession={loginSession}
              />
            );
          })}
        </div>
      </div>
    </Layout>
  );
};

export default IdentifierPage;
