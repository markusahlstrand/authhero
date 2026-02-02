import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import ErrorMessage from "./ErrorMessage";
import FormComponent from "./Form";
import Button from "./Button";
import PasswordInput from "./PasswordInput";

type ResetPasswordPageProps = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  email: string;
};

const ResetPasswordPage: FC<ResetPasswordPageProps> = (params) => {
  const { error, theme, branding, client, email } = params;

  return (
    <Layout
      title={i18next.t("reset_password_title")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("reset_password_title")}
      </div>
      <div className="mb-6 text-gray-300">
        {`${i18next.t("reset_password_description")} ${email}`}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <FormComponent>
          <PasswordInput
            name="password"
            placeholder={i18next.t("enter_new_password_placeholder")}
          />
          <PasswordInput
            name="re-enter-password"
            placeholder={i18next.t("reenter_new_password_placeholder")}
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button className="sm:mt-4 !text-base">
            {i18next.t("reset_password_cta")}
          </Button>
        </FormComponent>
      </div>
    </Layout>
  );
};

export default ResetPasswordPage;
