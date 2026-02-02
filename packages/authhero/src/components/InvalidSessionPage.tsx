import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";

type Props = {
  redirectUrl?: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
};

const InvalidSessionPage: FC<Props> = (params) => {
  const { redirectUrl, theme, branding, client } = params;

  return (
    <Layout
      title={i18next.t("invalid_session_title")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="flex flex-1 flex-col justify-center">
        {i18next.t("invalid_session_body")}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        {redirectUrl && (
          <a
            className="block text-primary hover:text-primaryHover text-center"
            href={redirectUrl}
          >
            {i18next.t("go_back")}
          </a>
        )}
      </div>
    </Layout>
  );
};

export default InvalidSessionPage;
