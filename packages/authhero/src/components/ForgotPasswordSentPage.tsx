import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { VendorSettings } from "authhero";
import { GoBack } from "./GoBack";
import i18next from "i18next";
import Icon from "./Icon";

type Props = {
  vendorSettings: VendorSettings;
  state: string;
};

const ForgotPasswordSentPage: FC<Props> = (params) => {
  const { vendorSettings, state } = params;

  return (
    <Layout title="Login" vendorSettings={vendorSettings}>
      <div className="flex flex-1 flex-col justify-center">
        <div>{i18next.t("forgot_password_email_sent")}</div>
        <div className="my-4 flex space-x-2 text-sm text-[#B2B2B2]">
          <Icon className="text-base" name="info-bubble" />
          <div className="text-sm text-gray-300 md:text-sm">
            {i18next.t("sent_code_spam")}
          </div>
        </div>
      </div>
      <GoBack state={state} />
    </Layout>
  );
};

export default ForgotPasswordSentPage;
