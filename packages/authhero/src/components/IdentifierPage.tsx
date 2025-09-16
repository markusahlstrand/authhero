import type { FC } from "hono/jsx";
import {
  LegacyClient,
  LoginSession,
  Theme,
  Branding,
} from "@authhero/adapter-interfaces";
import Layout from "./Layout";
import i18next from "i18next";
import cn from "classnames";
import Icon from "./Icon";
import ErrorMessage from "./ErrorMessage";
import SocialButton from "./SocialButton";
import Google from "./GoogleLogo";
import FormComponent from "./Form";
import VippsLogo from "./VippsLogo";
import Button from "./Button";

type Props = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  loginSession: LoginSession;
  email?: string;
  client: LegacyClient;
};

const IdentifierPage: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
  client,
}) => {
  const connections = client.connections.map(({ strategy }) => strategy);

  // Determine which input fields to show based on available connections
  const showEmailInput =
    connections.includes("email") ||
    connections.includes("Username-Password-Authentication");
  const showPhoneInput = connections.includes("sms");

  // Determine which social logins to show
  const showFacebook = connections.includes("facebook");
  const showGoogle = connections.includes("google-oauth2");
  const showApple = connections.includes("apple");
  const showVipps = connections.includes("vipps");
  const anySocialLogin = showFacebook || showGoogle || showApple || showVipps;

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
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("welcome")}
      </div>
      <div className="mb-8 text-gray-300">
        {i18next.t(authMethodTemplateKey, {
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
        })}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        {showForm && (
          <FormComponent className="mb-7">
            <input
              type={inputType}
              name={inputName}
              placeholder={inputPlaceholder}
              className={cn(
                "mb-2 w-full rounded-lg border bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base",
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
        {showForm && anySocialLogin && (
          <div className="relative mb-5 block text-center text-gray-300 dark:text-gray-300">
            <div className="absolute left-0 right-0 top-1/2 border-b border-gray-200 dark:border-gray-600" />
            <div className="relative inline-block bg-white px-2 dark:bg-gray-800">
              {i18next.t("continue_social_login")}
            </div>
          </div>
        )}
        <div className="flex space-x-4 sm:flex-col sm:space-x-0 sm:space-y-4 short:flex-row short:space-x-4 short:space-y-0">
          {showFacebook && (
            <SocialButton
              connection="facebook"
              text={i18next.t("continue_with", { provider: "Facebook" })}
              canResize={true}
              icon={
                <Icon
                  className="text-xl text-[#1196F5] sm:absolute sm:left-4 sm:top-1/2 sm:-translate-y-1/2 sm:text-2xl short:static short:left-auto short:top-auto short:translate-y-0 short:text-xl"
                  name="facebook"
                />
              }
              loginSession={loginSession}
            />
          )}
          {showGoogle && (
            <SocialButton
              connection="google-oauth2"
              text={i18next.t("continue_with", { provider: "Google" })}
              canResize={true}
              icon={
                <Google className="h-5 w-5 sm:absolute sm:left-4 sm:top-1/2 sm:h-6 sm:w-6 sm:-translate-y-1/2 short:static short:left-auto short:top-auto short:h-5 short:w-5 short:translate-y-0" />
              }
              loginSession={loginSession}
            />
          )}
          {showApple && (
            <SocialButton
              connection="apple"
              text={i18next.t("continue_with", { provider: "Apple" })}
              canResize={true}
              icon={
                <Icon
                  className="text-xl text-black dark:text-white sm:absolute sm:left-4 sm:top-1/2 sm:-translate-y-1/2 sm:text-2xl short:static short:left-auto short:top-auto short:translate-y-0 short:text-xl"
                  name="apple"
                />
              }
              loginSession={loginSession}
            />
          )}
          {showVipps && (
            <SocialButton
              connection="vipps"
              text={i18next.t("continue_with", { provider: "Vipps" })}
              canResize={true}
              icon={
                <VippsLogo className="h-5 w-5 sm:absolute sm:left-4 sm:top-1/2 sm:h-6 sm:w-6 sm:-translate-y-1/2 short:static short:left-auto short:top-auto short:h-5 short:w-5 short:translate-y-0" />
              }
              loginSession={loginSession}
            />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default IdentifierPage;
