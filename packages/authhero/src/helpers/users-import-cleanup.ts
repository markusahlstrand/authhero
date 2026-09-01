import { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * Auth0 deletes all job-related data 24 hours after the job is created.
 */
export const DEFAULT_IMPORT_JOB_RETENTION_HOURS = 24;

export interface UsersImportCleanupParams {
  /** Hours to keep finished import jobs. Defaults to Auth0's 24. */
  retentionHours?: number;
  /** Maximum jobs to delete per sweep. */
  limit?: number;
}

/**
 * Delete finished bulk-import jobs (and, by cascade, their staged rows)
 * older than the retention window.
 *
 * Staged rows hold the submitted user entries, so this is a privacy control
 * as much as a housekeeping one — though credential material is redacted
 * before staging rather than relying on this sweep.
 *
 * Only terminal jobs are removed: an unfinished import may legitimately be
 * older than the window (a very large file, or one that has been waiting on
 * a resume sweep), and deleting it would strand the users it had not yet
 * created. Returns the number of jobs deleted, or `null` when the
 * deployment has no tenant-operations adapter.
 */
export async function cleanupUsersImports(
  data: DataAdapters,
  params: UsersImportCleanupParams = {},
): Promise<number | null> {
  const operations = data.tenantOperations;
  if (!operations) return null;

  const retentionHours =
    params.retentionHours ?? DEFAULT_IMPORT_JOB_RETENTION_HOURS;
  const cutoff = new Date(
    Date.now() - retentionHours * 60 * 60 * 1000,
  ).toISOString();

  const stale = await operations.list({
    kind: "users_import",
    status: ["succeeded", "failed", "cancelled"],
    updated_before: cutoff,
    page: 0,
    per_page: params.limit ?? 100,
  });

  let deleted = 0;
  for (const operation of stale.operations) {
    // Staged rows cascade with the operation, but drop them explicitly first
    // so a deployment whose adapter lacks the FK cascade cannot leak them.
    if (data.tenantOperationRows) {
      await data.tenantOperationRows.removeByOperation(operation.id);
    }
    if (await operations.remove(operation.id)) {
      deleted += 1;
    }
  }

  return deleted;
}
