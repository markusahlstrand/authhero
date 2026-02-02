import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { GoBack } from "./GoBack";

type Props = {
  message: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  pageTitle?: string;
  state?: string;
};

const MessagePage: FC<Props> = (params) => {
  const { message, theme, branding, client, pageTitle, state } = params;

  return (
    <Layout title="Login" theme={theme} branding={branding} client={client}>
      {pageTitle ? (
        <div className="mb-4 text-2xl font-medium">{pageTitle}</div>
      ) : (
        ""
      )}
      <div className="text-gray-300 mb-12">{message}</div>
      {state ? <GoBack state={state} /> : ""}
    </Layout>
  );
};

export default MessagePage;
