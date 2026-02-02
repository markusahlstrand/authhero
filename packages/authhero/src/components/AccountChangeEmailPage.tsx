import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding, User } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import Button from "./Button";
import ErrorMessage from "./ErrorMessage";
import cn from "classnames";
import FormComponent from "./Form";
import Icon from "./Icon";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
  user: User;
  client: EnrichedClient;
  state: string;
  error?: string;
  success?: string;
};

const AccountChangeEmailPage: FC<Props> = (params) => {
  const { theme, branding, user, client, state, error } = params;

  return (
    <Layout
      title={i18next.t("change_email")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-2xl font-medium">
        {i18next.t("change_email")}
      </div>

      {/* Current Email Section */}
      <div className="column-left gap-1 mb-8">
        <div className="text-gray-300">{i18next.t("current_email")}</div>
        <div className="font-medium text-base text-gray-800">
          {user.email || i18next.t("no_email_address")}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <FormComponent>
          <input
            type="email"
            id="email"
            name="email"
            placeholder={i18next.t("new_email")}
            className={cn(
              "mb-2 w-full rounded-lg border bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base",
              {
                "border-red": error,
                "border-gray-100 dark:border-gray-500": !error,
              },
            )}
            required
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button className="sm:mt-4 !text-base">
            <span>{i18next.t("continue")}</span>
            <Icon className="text-xs" name="arrow-right" />
          </Button>
          <div className="my-4 flex space-x-2 text-sm text-[#B2B2B2]">
            <span className="uicon-info-bubble text-base"></span>
            <div className="text-sm text-gray-300 md:text-sm">
              {i18next.t("new_email_code_info")}
            </div>
          </div>
        </FormComponent>
        <a
          className="block text-primary hover:text-primaryHover text-center"
          href={`/u/account?state=${encodeURIComponent(state)}`}
        >
          {i18next.t("go_back")}
        </a>
      </div>
    </Layout>
  );
};

export default AccountChangeEmailPage;
