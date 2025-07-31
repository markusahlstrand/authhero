import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { GoBack } from "./GoBack";

type Props = {
  message: string;
  theme: Theme | null;
  branding: Branding | null;
  pageTitle?: string;
  state?: string;
};

const MessagePage: FC<Props> = (params) => {
  const { message, theme, branding, pageTitle, state } = params;

  return (
    <Layout title="Login" theme={theme} branding={branding}>
      {pageTitle ? <div className="mb-6 text-gray-300">{pageTitle}</div> : ""}
      <div className="flex flex-1 flex-col justify-center">{message}</div>
      {state ? <GoBack state={state} /> : ""}
    </Layout>
  );
};

export default MessagePage;
