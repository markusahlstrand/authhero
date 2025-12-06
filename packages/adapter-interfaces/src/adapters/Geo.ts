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
   * Get geo information from the current request
   * @returns Geo information or null if not available
   */
  getGeoInfo(): Promise<GeoInfo | null>;
}
