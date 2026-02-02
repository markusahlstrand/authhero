import type { FC, JSXNode } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding, User } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next, { t } from "i18next";
import Trans from "./Trans";
import FormComponent from "./Form";
import Button from "./Button";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  state: string;
  user: User;
};

const CheckEmailPage: FC<Props> = ({
  theme,
  branding,
  client,
  state,
  user,
}) => {
  return (
    <Layout
      title={t("check_email_title")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-8 text-gray-700 dark:text-gray-300">
          <Trans
            i18nKey="currently_logged_in_as"
            components={[
              (
                <span
                  className="font-semibold text-gray-900 dark:text-white"
                  key="span"
                />
              ) as unknown as JSXNode,
            ]}
            values={{ email: user.email || "" }}
          />
          <br />
          {t("continue_with_sso_provider_headline")}
        </div>

        <div className="space-y-6">
          <FormComponent>
            <Button className="!text-base">
              <span>{i18next.t("yes_continue_with_existing_account")}</span>
            </Button>
          </FormComponent>
          <a
            className="block text-center text-primary hover:text-primaryHover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            href={`/u/login/identifier?state=${encodeURIComponent(state)}`}
          >
            {i18next.t("no_use_another")}
          </a>
        </div>
      </div>
    </Layout>
  );
};

export default CheckEmailPage;
