import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import FormComponent from "./Form";
import { GoBack } from "./GoBack";
import Button from "./Button";

type Props = {
  state: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  email?: string;
};

const PreSignupPage: FC<Props> = (params) => {
  const { theme, branding, client, email, state } = params;

  return (
    <Layout
      title={i18next.t("create_password_account_title")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("create_password_account_title")}
      </div>
      <div className="mb-6 text-gray-300">
        {i18next.t("enter_email_for_verification_description")}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <FormComponent className="pt-2">
          <input
            type="email"
            name="username"
            placeholder={i18next.t("email_placeholder")}
            className="mb-2 w-full rounded-lg bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base"
            required
            value={email}
            disabled
          />
          <Button className="sm:mt-4 !text-base">{i18next.t("send")}</Button>
        </FormComponent>
      </div>
      <GoBack state={state} />
    </Layout>
  );
};

export default PreSignupPage;
