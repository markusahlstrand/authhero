import { GeoAdapter, GeoInfo } from "@authhero/adapter-interfaces";

/**
 * Creates a Cloudflare geo adapter that extracts location information from
 * Cloudflare's HTTP headers.
 *
 * ## Header Availability
 *
 * **Always available** (when IP Geolocation is enabled in Cloudflare dashboard):
 * - `cf-ipcountry`: 2-letter ISO country code
 *
 * **Available with "Add visitor location headers" Managed Transform**:
 * (Free feature in Cloudflare Rules > Transform Rules > Managed Transforms)
 * - `cf-ipcity`: City name
 * - `cf-ipcontinent`: 2-letter continent code
 * - `cf-iplatitude`: Latitude coordinate
 * - `cf-iplongitude`: Longitude coordinate
 * - `cf-timezone`: IANA timezone identifier
 * - `cf-region`: Region name
 * - `cf-region-code`: Region code
 * - `cf-metro-code`: Metro code
 * - `cf-postal-code`: Postal code
 *
 * The adapter gracefully handles both scenarios - returning only country_code
 * when the Managed Transform is not enabled, or full location data when it is.
 *
 * @example
 * ```typescript
 * import { createCloudflareGeoAdapter } from "@authhero/cloudflare-adapter";
 *
 * const geoAdapter = createCloudflareGeoAdapter();
 *
 * // In your request handler, pass the headers
 * const headers = Object.fromEntries(request.headers);
 * const geoInfo = await geoAdapter.getGeoInfo(headers);
 * ```
 */
export function createCloudflareGeoAdapter(): GeoAdapter {
  return {
    async getGeoInfo(headers: Record<string, string>): Promise<GeoInfo | null> {
      try {
        // cf-ipcountry is always available when IP Geolocation is enabled
        // in the Cloudflare dashboard (Network settings)
        const countryCode = headers["cf-ipcountry"];

        // These headers require "Add visitor location headers" Managed Transform
        // (Rules > Transform Rules > Managed Transforms - free feature)
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
