import { GeoAdapter, GeoInfo } from "@authhero/adapter-interfaces";

export interface CloudflareGeoAdapterConfig {
  /**
   * Function to get request headers
   * This allows the adapter to be used in different contexts (workers, etc.)
   */
  getHeaders: () => Record<string, string>;
}

export function createCloudflareGeoAdapter(
  config: CloudflareGeoAdapterConfig,
): GeoAdapter {
  return {
    async getGeoInfo(): Promise<GeoInfo | null> {
      try {
        const headers = config.getHeaders();

        // Cloudflare geo headers
        const countryCode = headers["cf-ipcountry"];
        const cityName = headers["cf-ipcity"];
        const latitude = headers["cf-iplatitude"];
        const longitude = headers["cf-iplongitude"];
        const timeZone = headers["cf-timezone"];
        const continentCode = headers["cf-ipcontinent"];

        // Only return geo info if we have at least a country code
        if (!countryCode) {
          return null;
        }

        return {
          country_code: countryCode,
          city_name: cityName || "",
          latitude: latitude || "",
          longitude: longitude || "",
          time_zone: timeZone || "",
          continent_code: continentCode || "",
        };
      } catch (error) {
        console.warn("Failed to get geo info from Cloudflare headers:", error);
        return null;
      }
    },
  };
}
