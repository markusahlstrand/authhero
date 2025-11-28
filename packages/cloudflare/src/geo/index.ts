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

        // Map 2-letter country code to 3-letter and get country name
        const countryCode3 = getCountryCode3(countryCode);
        const countryName = getCountryName(countryCode);

        return {
          country_code: countryCode,
          country_code3: countryCode3,
          country_name: countryName,
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

// Comprehensive country code mappings (2-letter to 3-letter ISO 3166-1)
function getCountryCode3(countryCode: string): string {
  const mappings: Record<string, string> = {
    // North America
    US: "USA",
    CA: "CAN",
    MX: "MEX",

    // Europe
    GB: "GBR",
    DE: "DEU",
    FR: "FRA",
    IT: "ITA",
    ES: "ESP",
    NL: "NLD",
    BE: "BEL",
    CH: "CHE",
    AT: "AUT",
    SE: "SWE",
    NO: "NOR",
    DK: "DNK",
    FI: "FIN",
    PL: "POL",
    RU: "RUS",
    UA: "UKR",

    // Asia
    JP: "JPN",
    CN: "CHN",
    IN: "IND",
    KR: "KOR",
    SG: "SGP",
    HK: "HKG",
    TW: "TWN",
    TH: "THA",
    MY: "MYS",
    ID: "IDN",
    PH: "PHL",
    VN: "VNM",

    // Oceania
    AU: "AUS",
    NZ: "NZL",

    // South America
    BR: "BRA",
    AR: "ARG",
    CL: "CHL",
    CO: "COL",
    PE: "PER",
    VE: "VEN",

    // Africa
    ZA: "ZAF",
    EG: "EGY",
    NG: "NGA",
    KE: "KEN",
    MA: "MAR",
    GH: "GHA",

    // Middle East
    AE: "ARE",
    SA: "SAU",
    IL: "ISR",
    TR: "TUR",
    IR: "IRN",
  };

  // If we have a mapping, use it; otherwise construct from 2-letter code
  return (
    mappings[countryCode] ||
    (countryCode.length === 2
      ? countryCode + countryCode.charAt(1)
      : countryCode)
  );
}

// Comprehensive country name mappings
function getCountryName(countryCode: string): string {
  const mappings: Record<string, string> = {
    // North America
    US: "United States",
    CA: "Canada",
    MX: "Mexico",

    // Europe
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    IT: "Italy",
    ES: "Spain",
    NL: "Netherlands",
    BE: "Belgium",
    CH: "Switzerland",
    AT: "Austria",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    PL: "Poland",
    RU: "Russia",
    UA: "Ukraine",

    // Asia
    JP: "Japan",
    CN: "China",
    IN: "India",
    KR: "South Korea",
    SG: "Singapore",
    HK: "Hong Kong",
    TW: "Taiwan",
    TH: "Thailand",
    MY: "Malaysia",
    ID: "Indonesia",
    PH: "Philippines",
    VN: "Vietnam",

    // Oceania
    AU: "Australia",
    NZ: "New Zealand",

    // South America
    BR: "Brazil",
    AR: "Argentina",
    CL: "Chile",
    CO: "Colombia",
    PE: "Peru",
    VE: "Venezuela",

    // Africa
    ZA: "South Africa",
    EG: "Egypt",
    NG: "Nigeria",
    KE: "Kenya",
    MA: "Morocco",
    GH: "Ghana",

    // Middle East
    AE: "United Arab Emirates",
    SA: "Saudi Arabia",
    IL: "Israel",
    TR: "Turkey",
    IR: "Iran",
  };

  // Return mapped name or fallback to the country code itself
  return mappings[countryCode] || countryCode;
}
