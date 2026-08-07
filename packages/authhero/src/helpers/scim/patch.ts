/**
 * Minimal SCIM 2.0 PATCH support (RFC 7644 §3.5.2), scoped to what Okta and
 * Microsoft Entra send when provisioning users: `add` / `replace` / `remove`
 * with either no path (a value object merged into the resource), a simple
 * dotted path (`active`, `name.givenName`, `displayName`), or a single
 * value-filtered multi-valued path (`emails[type eq "work"].value`).
 *
 * Operates on and returns a plain SCIM resource object; the route layer maps
 * the patched resource back to AuthHero user fields. Anything outside the
 * supported shape throws, which the route turns into a SCIM 400/501.
 */

export class InvalidPatchError extends Error {}
export class UnsupportedPatchError extends Error {}

export interface ScimPatchOperation {
  op: string;
  path?: string;
  value?: unknown;
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Parse a path into segments, recognising at most one value-filter segment of
// the form `attr[sub eq "val"]` optionally followed by `.subAttr`.
interface PathSegmentPlain {
  kind: "plain";
  key: string;
}
interface PathSegmentFiltered {
  kind: "filtered";
  key: string; // the multi-valued attribute, e.g. "emails"
  filterAttr: string; // e.g. "type"
  filterValue: string | boolean;
  // A sub-attribute (`…].value`) arrives as the next plain segment, so it is
  // read from `rest[0]` in applyToTarget rather than stored here.
}

function parsePath(path: string): (PathSegmentPlain | PathSegmentFiltered)[] {
  const segments: (PathSegmentPlain | PathSegmentFiltered)[] = [];
  // Split on dots that are not inside [...].
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of path) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "." && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);

  for (const part of parts) {
    const filterMatch = part.match(
      /^([^[\]]+)\[\s*([^\s]+)\s+eq\s+(?:"([^"]*)"|(true|false))\s*\]$/i,
    );
    if (filterMatch) {
      const key = filterMatch[1]!;
      const filterAttr = filterMatch[2]!;
      const strVal = filterMatch[3];
      const boolVal = filterMatch[4];
      segments.push({
        kind: "filtered",
        key,
        filterAttr,
        filterValue: boolVal !== undefined ? boolVal === "true" : strVal!,
      });
    } else if (/[[\]]/.test(part)) {
      throw new UnsupportedPatchError(`Unsupported path segment "${part}"`);
    } else {
      segments.push({ kind: "plain", key: part });
    }
  }
  return segments;
}

function applyToTarget(
  resource: Json,
  segments: (PathSegmentPlain | PathSegmentFiltered)[],
  op: "add" | "replace" | "remove",
  value: unknown,
): void {
  const seg = segments[0];
  if (!seg) return;
  const rest = segments.slice(1);

  if (seg.kind === "plain" && rest.length === 0) {
    if (op === "remove") {
      delete resource[seg.key];
    } else {
      resource[seg.key] = value;
    }
    return;
  }

  if (seg.kind === "plain") {
    if (!isObject(resource[seg.key])) resource[seg.key] = {};
    applyToTarget(resource[seg.key] as Json, rest, op, value);
    return;
  }

  // filtered segment (multi-valued attribute)
  const arr = Array.isArray(resource[seg.key])
    ? (resource[seg.key] as Json[])
    : [];
  let element = arr.find(
    (e) => isObject(e) && e[seg.filterAttr] === seg.filterValue,
  );
  if (!element) {
    if (op === "remove") return; // nothing to remove
    element = { [seg.filterAttr]: seg.filterValue };
    arr.push(element);
  }
  if (rest.length === 0) {
    if (op === "remove") {
      const idx = arr.indexOf(element);
      if (idx >= 0) arr.splice(idx, 1);
    } else if (isObject(value)) {
      Object.assign(element, value);
    }
  } else {
    if (rest.length > 1) {
      // e.g. `emails[type eq "work"].value.deep` — nothing in our resource
      // shape nests that far, so reject rather than silently drop segments.
      throw new UnsupportedPatchError(
        "Unsupported nested value-path in patch operation",
      );
    }
    const subKey = (rest[0] as PathSegmentPlain)?.key;
    if (!subKey) throw new InvalidPatchError("Invalid value-path target");
    if (op === "remove") {
      delete element[subKey];
    } else {
      element[subKey] = value;
    }
  }
  resource[seg.key] = arr;
}

export function applyScimPatch(
  resource: Json,
  operations: ScimPatchOperation[],
): Json {
  const result: Json = structuredClone(resource);

  for (const rawOp of operations) {
    const op = String(rawOp.op || "").toLowerCase();
    if (op !== "add" && op !== "replace" && op !== "remove") {
      throw new UnsupportedPatchError(`Unsupported patch op "${rawOp.op}"`);
    }

    if (!rawOp.path) {
      // No path: `value` is a partial resource to merge (add/replace). SCIM
      // does not define pathless remove.
      if (op === "remove") {
        throw new InvalidPatchError("remove requires a path");
      }
      if (!isObject(rawOp.value)) {
        throw new InvalidPatchError(
          "add/replace without a path requires an object value",
        );
      }
      for (const [k, v] of Object.entries(rawOp.value)) {
        if (isObject(v) && isObject(result[k])) {
          result[k] = { ...(result[k] as Json), ...v };
        } else {
          result[k] = v;
        }
      }
      continue;
    }

    const segments = parsePath(rawOp.path);
    applyToTarget(result, segments, op, rawOp.value);
  }

  return result;
}
