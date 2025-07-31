import { Branding, Theme } from "@authhero/adapter-interfaces";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
};
const Footer = (_props: Props) => {
  // Note: termsAndConditionsUrl is not in the Theme or Branding schema yet
  // You might want to add this to the schema or get it from another source

  return (
    <div className="mt-8">
      {/* Commenting out until termsAndConditionsUrl is added to Theme or Branding schema */}
      {/* {branding?.termsAndConditionsUrl && (
        <div className="text-xs text-gray-300">
          {i18next.t("agree_to")}{" "}
          <a
            href={branding.termsAndConditionsUrl}
            className="text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {i18next.t("terms")}
          </a>
        </div>
      )} */}
    </div>
  );
};

export default Footer;
