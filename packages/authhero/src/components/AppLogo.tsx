import { VendorSettings } from "@authhero/adapter-interfaces";
import type { FC } from "hono/jsx";

type AppLogoProps = {
  vendorSettings: VendorSettings;
};

const AppLogo: FC<AppLogoProps> = ({ vendorSettings }) => {
  if (vendorSettings?.logoUrl) {
    return (
      <div className="flex h-9 items-center">
        <img
          src={vendorSettings.logoUrl}
          className="max-h-full"
          alt="Vendor logo"
        />
      </div>
    );
  }

  return <></>;
};

export default AppLogo;
