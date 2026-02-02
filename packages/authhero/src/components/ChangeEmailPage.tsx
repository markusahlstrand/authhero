import type { FC, JSXNode } from "hono/jsx";
import Layout from "./Layout";
import Button from "./Button";
import i18next from "i18next";
import cn from "classnames";
import Icon from "./Icon";
import ErrorMessage from "./ErrorMessage";
import FormComponent from "./Form";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import Trans from "./Trans";

type Props = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  email: string;
  success?: boolean;
  state?: string;
  redirectUrl?: string;
};

const CODE_LENGTH = 6;

const ChangeEmailPage: FC<Props> = ({
  error,
  theme,
  branding,
  client,
  email,
  success,
  state,
  redirectUrl,
}) => {
  // If success, show success message with continue button
  if (success) {
    return (
      <Layout
        title={i18next.t("success")}
        theme={theme}
        branding={branding}
        client={client}
      >
        <div className="mb-4 text-2xl font-medium">{i18next.t("success")}</div>
        <div className="mb-8 text-gray-300">
          <Trans
            i18nKey="email_changed_to_template"
            components={[
              (
                <span className="text-black dark:text-white" key="span" />
              ) as unknown as JSXNode,
            ]}
            values={{
              email: email,
            }}
          />
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <Button
            Component="a"
            href={
              redirectUrl ||
              (state
                ? `/u/account?state=${encodeURIComponent(state)}`
                : `/u/account?client_id=${encodeURIComponent(client.client_id)}`)
            }
            className="sm:mt-4 !text-base"
          >
            <span>{i18next.t("continue")}</span>
            <Icon className="text-xs" name="arrow-right" />
          </Button>
        </div>
      </Layout>
    );
  }
  return (
    <Layout
      title={i18next.t("verify_email_verify")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-2xl font-medium">
        {i18next.t("verify_email_verify")}
      </div>
      <div className="mb-8 text-gray-300">
        <Trans
          i18nKey="code_sent_template"
          components={[
            (
              <span className="text-black dark:text-white" key="span" />
            ) as unknown as JSXNode,
          ]}
          values={{
            username: email,
          }}
        />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <FormComponent className="pt-2">
          <input
            autoFocus
            type="text"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            inputMode="numeric"
            name="code"
            placeholder="******"
            className={cn(
              "mb-2 w-full rounded-lg border bg-gray-100 px-4 pb-2 pt-2.5 text-center indent-[5px] font-mono text-3xl placeholder:text-gray-300 dark:bg-gray-600 md:text-3xl",
              {
                "border-red": error,
                "border-gray-100 dark:border-gray-500": !error,
              },
            )}
            minLength={CODE_LENGTH}
            required
            id="code-input"
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button className="sm:mt-4 !text-base">
            <span>{i18next.t("continue")}</span>
            <Icon className="text-xs" name="arrow-right" />
          </Button>
          <div className="my-4 flex space-x-2 text-sm text-[#B2B2B2]">
            <Icon className="text-base" name="info-bubble" />
            <div className="text-sm text-gray-300 md:text-sm">
              {i18next.t("sent_code_spam")}
            </div>
          </div>
        </FormComponent>
        <a
          className="block text-primary hover:text-primaryHover text-center"
          href={
            state
              ? `/u/account?state=${encodeURIComponent(state)}`
              : `/u/account?client_id=${encodeURIComponent(client.client_id)}`
          }
        >
          {i18next.t("go_back")}
        </a>
      </div>
    </Layout>
  );
};

export default ChangeEmailPage;
