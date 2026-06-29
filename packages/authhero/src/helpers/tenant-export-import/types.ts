import {
  DataAdapters,
  ImportMetadata,
  importMetadataSchema,
} from "@authhero/adapter-interfaces";

/**
 * A single JSON-lines record in a tenant export stream.
 *
 * `entity` is the durable entity name (see {@link EXPORT_ORDER}); `data` is the
 * raw row as returned by the source adapter's read methods. The stream is
 * ordered so that a sequential importer can recreate FK parents before their
 * children.
 */
export interface ExportLine {
  entity: string;
  data: unknown;
}

export interface ExportOptions {
  /**
   * When false, the `passwords` entity is skipped entirely on export so the
   * stream never carries password hashes. Defaults to false at the call sites
   * that want a redacted export.
   */
  includePasswordHashes: boolean;
}

export interface ImportOptions {
  /**
   * When false, any `passwords` lines present in the stream are ignored on
   * import (defence in depth — a redacted export shouldn't contain them, but
   * the importer refuses to write them regardless).
   */
  includePasswordHashes: boolean;
}

/** One failed row during import, surfaced rather than aborting the whole run. */
export interface ImportError {
  entity: string;
  error: string;
}

export interface ImportResult {
  /** Number of rows successfully written, keyed by entity name. */
  counts: Record<string, number>;
  /** Non-fatal per-row failures collected during the run. */
  errors: ImportError[];
}

/**
 * Build the `importMetadata` argument from a row, preserving id/timestamps.
 * Returns `undefined` when none of the fields are present so callers can spread
 * it without sending an empty object.
 */
export function buildImportMetadata(params: {
  id?: string;
  created_at?: string;
  updated_at?: string;
}): { importMetadata: ImportMetadata } | undefined {
  const raw: ImportMetadata = {};
  if (params.id !== undefined) raw.id = params.id;
  if (params.created_at !== undefined) raw.created_at = params.created_at;
  if (params.updated_at !== undefined) raw.updated_at = params.updated_at;

  if (Object.keys(raw).length === 0) return undefined;
  // Validate timestamps up front so malformed metadata is rejected at this
  // boundary (and surfaced as a per-row import error) instead of failing later
  // inside adapter/DB code.
  return { importMetadata: importMetadataSchema.parse(raw) };
}

export type { DataAdapters };
