import { UserActivity, UserActivityUpdate } from "../types/UserActivity";

export interface UserActivityAdapter {
  get(tenantId: string, userId: string): Promise<UserActivity | null>;
  /**
   * Insert or merge-update the activity row for a user. Only the provided
   * fields are written; previously-stored fields are preserved.
   */
  upsert(
    tenantId: string,
    userId: string,
    activity: UserActivityUpdate,
  ): Promise<void>;
}
