import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { VendorSettings } from "@authhero/adapter-interfaces";
import i18next from "i18next";

type Props = {
  redirectUrl?: string;
  vendorSettings: VendorSettings;
};

const InvalidSessionPage: FC<Props> = (params) => {
  const { redirectUrl, vendorSettings } = params;

  return (
    <Layout
      title={i18next.t("invalid_session_title")}
      vendorSettings={vendorSettings}
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
