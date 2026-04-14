import { AuditEvent, UserDataAdapter } from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";

const POST_REGISTRATION_EVENT_TYPE = "hook.post-user-registration";

interface FinalizationTask {
  tenantId: string;
  userId: string;
  timestamp: string;
}

/**
 * Side-effect destination that flips `user.registration_completed_at` once
 * the upstream hook destinations (webhooks, code hooks) have all succeeded
 * for a `hook.post-user-registration` event.
 *
 * Must be listed AFTER the destinations that actually deliver the hook so
 * that a delivery failure aborts the loop before the flag is set — the
 * relay then retries the entire event, and on a subsequent successful pass
 * the finalizer sets the flag.
 *
 * The flag is read by `postUserLoginHook` to decide whether to re-enqueue
 * the event on the next login (self-healing recovery).
 */
export class RegistrationFinalizerDestination implements EventDestination {
  name = "registration-finalizer";
  private users: UserDataAdapter;

  constructor(users: UserDataAdapter) {
    this.users = users;
  }

  accepts(event: AuditEvent): boolean {
    return event.event_type === POST_REGISTRATION_EVENT_TYPE;
  }

  transform(event: AuditEvent): FinalizationTask {
    return {
      tenantId: event.tenant_id,
      userId: event.target?.id ?? "",
      timestamp: new Date().toISOString(),
    };
  }

  async deliver(tasks: FinalizationTask[]): Promise<void> {
    for (const { tenantId, userId, timestamp } of tasks) {
      if (!userId) continue;
      await this.users.update(tenantId, userId, {
        registration_completed_at: timestamp,
      });
    }
  }
}
