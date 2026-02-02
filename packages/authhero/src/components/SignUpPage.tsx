import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import ErrorMessage from "./ErrorMessage";
import FormComponent from "./Form";
import { GoBack } from "./GoBack";
import Button from "./Button";

type Props = {
  state: string;
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  email?: string;
  code?: string;
};

const SignupPage: FC<Props> = (params) => {
  const { error, theme, branding, client, email, state, code } = params;

  return (
    <Layout
      title={i18next.t("sign_up")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("create_account_title")}
      </div>
      <div className="mb-6 text-gray-300">
        {i18next.t("create_account_description")}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <FormComponent>
          <input type="hidden" name="code" value={code} />
          <input
            type="email"
            name="username"
            placeholder={i18next.t("email_placeholder")}
            className="mb-2 w-full rounded-lg bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base"
            required
            value={email}
            disabled={!!email}
          />
          <input
            type="password"
            name="password"
            placeholder={i18next.t("enter_new_password_placeholder")}
            className="mb-2 w-full rounded-lg bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base"
          />
          <input
            type="password"
            name="re-enter-password"
            placeholder={i18next.t("reenter_new_password_placeholder")}
            className="mb-2 w-full rounded-lg bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base"
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button className="sm:mt-4 !text-base">
            {i18next.t("continue")}
          </Button>
        </FormComponent>
        <GoBack state={state} />
      </div>
    </Layout>
  );
};

export default SignupPage;
