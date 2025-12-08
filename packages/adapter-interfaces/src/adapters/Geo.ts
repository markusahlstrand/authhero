export interface GeoInfo {
  country_code: string;
  city_name: string;
  latitude: string;
  longitude: string;
  time_zone: string;
  continent_code: string;
}

export interface GeoAdapter {
  /**
   * Get geo information from request headers
   * @param headers - Record of HTTP headers (lowercase keys)
   * @returns Geo information or null if not available
   */
  getGeoInfo(headers: Record<string, string>): Promise<GeoInfo | null>;
}
