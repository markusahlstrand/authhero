import { Branding, Theme } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient | null;
};
const Footer = (_props: Props) => {
  return (
    <div className="mt-8">
      {_props.client?.client_metadata?.termsAndConditionsUrl && (
        <div className="text-xs text-gray-300">
          {i18next.t("agree_to")}{" "}
          <a
            href={_props.client.client_metadata.termsAndConditionsUrl}
            className="text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {i18next.t("terms")}
          </a>
        </div>
      )}
    </div>
  );
};

export default Footer;
