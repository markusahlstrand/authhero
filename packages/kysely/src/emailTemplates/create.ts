import { EmailTemplate, CreateOptions } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    template: EmailTemplate,
    options?: CreateOptions,
  ): Promise<EmailTemplate> => {
    const importMetadata = options?.importMetadata;
    const ts = new Date().toISOString();
    const created_at = importMetadata?.created_at ?? ts;
    // Preserve source timestamp on import: fall back to the imported created_at
    // (not replay time) when updated_at is absent.
    const updated_at =
      importMetadata?.updated_at ?? importMetadata?.created_at ?? ts;

    await db
      .insertInto("email_templates")
      .values({
        tenant_id,
        template: template.template,
        body: template.body,
        from: template.from,
        subject: template.subject,
        syntax: template.syntax,
        result_url: template.resultUrl ?? null,
        url_lifetime_in_seconds: template.urlLifetimeInSeconds ?? null,
        include_email_in_redirect: template.includeEmailInRedirect ? 1 : 0,
        enabled: template.enabled ? 1 : 0,
        created_at,
        updated_at,
      })
      .execute();

    return template;
  };
}
