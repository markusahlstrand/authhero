import Button from "./Button";
import Layout from "./Layout";
import i18next from "i18next";
import type { FC } from "hono/jsx";
import {
  AuthParams,
  Theme,
  Branding,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";

type Props = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  authParams: AuthParams;
};

const UserNotFound: FC<Props> = (params) => {
  const { theme, branding, client, authParams } = params;

  // Convert authParams to URL-safe string values
  const linkParams = new URLSearchParams(
    Object.entries(authParams)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const restartFlowLink = `/authorize?${linkParams}`;

  return (
    <Layout
      theme={theme}
      branding={branding}
      client={client}
      title={i18next.t("user_not_found")}
    >
      <div className="flex flex-1 flex-col justify-center">
        <p className="mb-8 text-gray-300 text-lg">
          {i18next.t("user_not_found_body")}
        </p>
        <Button Component="a" href={restartFlowLink}>
          {i18next.t("user_not_found_cta")}
        </Button>
      </div>
    </Layout>
  );
};

export default UserNotFound;
