---
title: Adapter Interfaces
description: Interface definitions for AuthHero adapters including UserAdapter, ConnectionAdapter, DomainAdapter, TokenAdapter, and GeoAdapter for location data.
---

# Adapter Interfaces

The `adapter-interfaces` package defines the interfaces that all AuthHero adapters must implement. These interfaces provide a consistent API for AuthHero to interact with different database systems.

## Core Interfaces

### `Adapter`

The main adapter interface that combines all specialized adapters:

```typescript
interface Adapter
  extends UserAdapter,
    ConnectionAdapter,
    DomainAdapter,
    TokenAdapter {
  // Common methods
}
```

### `UserAdapter`

Interface for user management operations:

```typescript
interface UserAdapter {
  createUser(data: UserCreate): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, data: UserUpdate): Promise<User>;
  deleteUser(id: string): Promise<void>;
  // Other user methods
}
```

### `GeoAdapter`

Interface for retrieving geographic information from requests. This is used to enrich authentication logs with location data.

```typescript
interface GeoInfo {
  country_code: string; // 2-letter ISO country code (e.g., "US")
  city_name: string; // City name
  latitude: string; // Latitude coordinate
  longitude: string; // Longitude coordinate
  time_zone: string; // IANA time zone (e.g., "America/New_York")
  continent_code: string; // 2-letter continent code (e.g., "NA")
}

interface GeoAdapter {
  /**
   * Get geo information from request headers
   * @param headers - Record of HTTP headers (lowercase keys)
   * @returns Geo information or null if not available
   */
  getGeoInfo(headers: Record<string, string>): Promise<GeoInfo | null>;
}
```

#### Implementation Options

There are two primary approaches to implementing geo location:

**1. Edge Provider Headers (Recommended)**

Use headers provided by edge platforms like Cloudflare Workers, which automatically include geo information:

```typescript
import { createCloudflareGeoAdapter } from "@authhero/cloudflare-adapter";

// Create the adapter once
const geoAdapter = createCloudflareGeoAdapter();

// Pass headers at request time
const headers = Object.fromEntries(request.headers);
const geoInfo = await geoAdapter.getGeoInfo(headers);
```

**Cloudflare Setup:**

1. Enable **IP Geolocation** in Network settings (provides `cf-ipcountry`)
2. Enable **"Add visitor location headers"** in Rules > Transform Rules > Managed Transforms (free feature, provides full location data)

**Benefits:**

- No external API calls required
- Zero latency
- No additional costs
- Automatically provided by the edge platform

**2. IP Geolocation Database (Alternative)**

Use a geo database service like MaxMind GeoIP2 to look up location based on IP address:

````typescript
import maxmind from "maxmind";

class MaxMindGeoAdapter implements GeoAdapter {
  private reader: maxmind.Reader<maxmind.CityResponse>;

  private constructor(reader: maxmind.Reader<maxmind.CityResponse>) {
    this.reader = reader;
  }

  static async create(databasePath: string): Promise<MaxMindGeoAdapter> {
    const reader = await maxmind.open<maxmind.CityResponse>(databasePath);
    return new MaxMindGeoAdapter(reader);
  }

  async getGeoInfo(headers: Record<string, string>): Promise<GeoInfo | null> {
    // Extract IP from headers
    const ip = headers["cf-connecting-ip"] ||
               headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               headers["x-real-ip"];

    if (!ip) return null;

    const lookup = this.reader.get(ip);

    if (!lookup) return null;

    return {
      country_code: lookup.country?.iso_code || "",
      city_name: lookup.city?.names?.en || "",
      latitude: lookup.location?.latitude?.toString() || "",
      longitude: lookup.location?.longitude?.toString() || "",
      time_zone: lookup.location?.time_zone || "",
      continent_code: lookup.continent?.code || "",
    };
  }
}

// Usage:
const geoAdapter = await MaxMindGeoAdapter.create("/path/to/GeoLite2-City.mmdb");
```**Benefits:**

- Works in any environment
- Can be used with local databases for privacy
- More detailed city-level data

**Considerations:**

- Requires database downloads and updates
- Additional latency for lookups
- May require licensing (MaxMind, IP2Location, etc.)

#### Usage in Logs

When a `GeoAdapter` is configured, authentication logs automatically include location information:

```json
{
  "type": "s",
  "date": "2025-11-28T12:00:00.000Z",
  "location_info": {
    "country_code": "US",
    "city_name": "San Francisco",
    "latitude": "37.7749",
    "longitude": "-122.4194",
    "time_zone": "America/Los_Angeles",
    "continent_code": "NA"
  }
}
````

[Other adapter interfaces will be documented here]

## Creating a Custom Adapter

To create a custom adapter, you need to implement all the required interfaces:

```typescript
import { Adapter } from "authhero-adapter-interfaces";

class MyCustomAdapter implements Adapter {
  // Implement all required methods
}
```

## Data Types

The adapter interfaces use several common data types:

[Data type definitions will be documented here]
