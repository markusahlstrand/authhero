import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { VendorSettings } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import ErrorMessage from "./ErrorMessage";
import Form from "./Form";
import Button from "./Button";

type ResetPasswordPageProps = {
  error?: string;
  vendorSettings: VendorSettings;
  email: string;
};

const ResetPasswordPage: FC<ResetPasswordPageProps> = (params) => {
  const { error, vendorSettings, email } = params;

  return (
    <Layout
      title={i18next.t("reset_password_title")}
      vendorSettings={vendorSettings}
    >
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("reset_password_title")}
      </div>
      <div className="mb-6 text-gray-300">
        {`${i18next.t("reset_password_description")} ${email}`}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <Form>
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
            {i18next.t("reset_password_cta")}
          </Button>
        </Form>
      </div>
    </Layout>
  );
};

export default ResetPasswordPage;
