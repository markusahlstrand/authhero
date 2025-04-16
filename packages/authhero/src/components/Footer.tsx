import i18next from "i18next";
import { VendorSettings } from "@authhero/adapter-interfaces";

type Props = {
  vendorSettings: VendorSettings;
};
const Footer = ({ vendorSettings }: Props) => {
  const { termsAndConditionsUrl } = vendorSettings;

  return (
    <div className="mt-8">
      {termsAndConditionsUrl && (
        <div className="text-xs text-gray-300">
          {i18next.t("agree_to")}{" "}
          <a
            href={termsAndConditionsUrl}
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
