import type { FC } from "hono/jsx";
import {
  Client,
  LoginSession,
  VendorSettings,
} from "@authhero/adapter-interfaces";
import Layout from "./Layout";
import i18next from "i18next";
import cn from "classnames";
import Icon from "./Icon";
import ErrorMessage from "./ErrorMessage";
import SocialButton from "./SocialButton";
import Google from "./GoogleLogo";
import Form from "./Form";
import VippsLogo from "./VippsLogo";
import Button from "./Button";

type Props = {
  error?: string;
  vendorSettings: VendorSettings;
  loginSession: LoginSession;
  email?: string;
  client: Client;
  impersonation?: boolean;
};

const EnterEmailPage: FC<Props> = ({
  error,
  vendorSettings,
  loginSession,
  email,
  client,
  impersonation,
}) => {
  const connections = client.connections.map(({ name }) => name);
  const showFacebook = connections.includes("facebook");
  const showGoogle = connections.includes("google-oauth2");
  const showApple = connections.includes("apple");
  const showVipps = connections.includes("vipps");
  const anySocialLogin = showFacebook || showGoogle || showApple || showVipps;

  return (
    <Layout title={i18next.t("welcome")} vendorSettings={vendorSettings}>
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("welcome")}
      </div>
      <div className="mb-8 text-gray-300">{i18next.t("login_description")}</div>
      <div className="flex flex-1 flex-col justify-center">
        <Form className="mb-7">
          <input
            type="email"
            name="username"
            placeholder={i18next.t("email_placeholder")}
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
          {impersonation && (
            <input
              type="email"
              name="act_as"
              placeholder="Impersonate as"
              className={cn(
                "mb-2 w-full rounded-lg border bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base",
                {
                  "border-red": error,
                  "border-gray-100 dark:border-gray-500": !error,
                },
              )}
              required
              value={""}
            />
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button className="sm:mt-4 !text-base">
            <span>{i18next.t("continue")}</span>
            <Icon className="text-xs" name="arrow-right" />
          </Button>
        </Form>
        {anySocialLogin && (
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

export default EnterEmailPage;
