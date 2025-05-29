import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { VendorSettings } from "@authhero/adapter-interfaces";
import { GoBack } from "./GoBack";

type Props = {
  message: string;
  vendorSettings: VendorSettings;
  pageTitle?: string;
  state?: string;
};

const MessagePage: FC<Props> = (params) => {
  const { message, vendorSettings, pageTitle, state } = params;

  return (
    <Layout title="Login" vendorSettings={vendorSettings}>
      {pageTitle ? <div className="mb-6 text-gray-300">{pageTitle}</div> : ""}
      <div className="flex flex-1 flex-col justify-center">{message}</div>
      {state ? <GoBack state={state} /> : ""}
    </Layout>
  );
};

export default MessagePage;
