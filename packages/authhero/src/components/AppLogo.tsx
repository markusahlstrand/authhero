import { Branding, Theme } from "@authhero/adapter-interfaces";
import type { FC } from "hono/jsx";

type AppLogoProps = {
  theme: Theme | null;
  branding: Branding | null;
};

const AppLogo: FC<AppLogoProps> = ({ theme, branding }) => {
  // Use theme logo first, fallback to branding logo
  const logoUrl = theme?.widget?.logo_url || branding?.logo_url;

  if (logoUrl) {
    return (
      <div className="flex h-9 items-center">
        <img src={logoUrl} className="max-h-full" alt="Logo" />
      </div>
    );
  }

  return <></>;
};

export default AppLogo;
