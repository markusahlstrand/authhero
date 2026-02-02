import type { FC, JSXNode } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import { GoBack } from "./GoBack";
import Icon from "./Icon";
import Trans from "./Trans";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  email: string;
  state: string;
};

const PreSignUpConfirmationPage: FC<Props> = (params) => {
  const { theme, branding, client, email, state } = params;

  return (
    <Layout
      title={i18next.t("sign_up_success")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("email_verification_for_signup_sent_title")}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-6 text-gray-300">
          <Trans
            i18nKey="email_verification_for_signup_sent_description"
            components={[
              (
                <span className="text-black dark:text-white" key="span" />
              ) as unknown as JSXNode,
            ]}
            values={{ email }}
          />
        </div>
        <div className="my-4 flex space-x-2 text-sm text-[#B2B2B2]">
          <Icon className="text-base" name="info-bubble" />
          <div className="text-sm text-gray-300 md:text-sm">
            {/* translation string should just be sent_spam */}
            {i18next.t("sent_code_spam")}
          </div>
        </div>
      </div>
      <GoBack state={state} />
    </Layout>
  );
};

export default PreSignUpConfirmationPage;
