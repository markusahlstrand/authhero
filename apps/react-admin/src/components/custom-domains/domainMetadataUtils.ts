/**
 * The API stores domain_metadata as a flat Record<string, string> with
 * dot-notation keys like "ssl.certificate_authority".
 *
 * React-admin form fields use nested source paths like
 * "domain_metadata.ssl.certificate_authority" which produces a nested object.
 *
 * These helpers convert between the two representations:
 * - unflattenDomainMetadata: API → react-admin (dot keys → nested object)
 * - flattenDomainMetadata:   react-admin → API (nested object → dot keys)
 */

type AnyRecord = Record<string, unknown>;

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Convert flat dot-notation domain_metadata keys into a nested object
 * so react-admin form fields can bind to them.
 *
 * { "ssl.certificate_authority": "google" } → { ssl: { certificate_authority: "google" } }
 */
export function unflattenDomainMetadata<T extends AnyRecord>(record: T): T {
    if (!record?.domain_metadata || typeof record.domain_metadata !== "object") {
        return record;
    }

    const flat = record.domain_metadata as Record<string, string>;
    const nested: AnyRecord = Object.create(null);

    for (const [key, value] of Object.entries(flat)) {
        const parts = key.split(".");
        if (parts.some((p) => BLOCKED_KEYS.has(p))) continue;
        let current: AnyRecord = nested;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i]!;
            if (!(part in current) || typeof current[part] !== "object") {
                current[part] = Object.create(null);
            }
            current = current[part] as AnyRecord;
        }
        current[parts[parts.length - 1]!] = value;
    }

    return { ...record, domain_metadata: nested };
}

/**
 * Convert nested domain_metadata back to flat dot-notation keys
 * for the API.
 *
 * { ssl: { certificate_authority: "google" } } → { "ssl.certificate_authority": "google" }
 */
export function flattenDomainMetadata<T extends AnyRecord>(record: T): T {
    if (!record?.domain_metadata || typeof record.domain_metadata !== "object") {
        return record;
    }

    const nested = record.domain_metadata as AnyRecord;
    const flat: Record<string, string> = Object.create(null);

    function walk(obj: AnyRecord, prefix: string) {
        for (const [key, value] of Object.entries(obj)) {
            if (BLOCKED_KEYS.has(key)) continue;
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === "object" && !Array.isArray(value)) {
                walk(value as AnyRecord, fullKey);
            } else if (value !== undefined && value !== null && value !== "") {
                flat[fullKey] = String(value);
            }
        }
    }

    walk(nested, "");

    return { ...record, domain_metadata: flat };
}
