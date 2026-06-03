import {
  BooleanInput,
  CodeInput,
  Edit,
  SimpleForm,
  TextInput,
} from "@/components/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRecordContext, useResourceContext } from "ra-core";
import { Info } from "lucide-react";
import { EmailTemplatePreview } from "./preview";
import { getTemplateDescription, getTemplateLabel } from "./template-names";

interface EmailTemplateRecord {
  id: string;
  template: string;
  is_override: boolean;
  default_html?: string;
  body?: string;
  subject?: string;
  from?: string;
  enabled?: boolean;
}

function transformEmailTemplate(data: Record<string, unknown>) {
  return {
    template: data.id ?? data.template,
    syntax: "liquid" as const,
    body: typeof data.body === "string" ? data.body : "",
    subject: typeof data.subject === "string" ? data.subject : "",
    from: typeof data.from === "string" ? data.from : "",
    enabled: data.enabled !== false,
    ...(data.resultUrl ? { resultUrl: data.resultUrl } : {}),
    ...(typeof data.urlLifetimeInSeconds === "number"
      ? { urlLifetimeInSeconds: data.urlLifetimeInSeconds }
      : {}),
    ...(typeof data.includeEmailInRedirect === "boolean"
      ? { includeEmailInRedirect: data.includeEmailInRedirect }
      : {}),
  };
}

function EmailTemplateHeader() {
  const record = useRecordContext<EmailTemplateRecord>();
  if (!record) return null;
  const label = getTemplateLabel(record.template);
  const description = getTemplateDescription(record.template);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-lg font-semibold">{label}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {!record.is_override ? (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Using bundled default</AlertTitle>
          <AlertDescription>
            No tenant override yet. Saving this form creates one — the bundled
            default is shown on the right until then.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function EmailTemplateFormContent() {
  const record = useRecordContext<EmailTemplateRecord>();

  return (
    <div className="flex w-full flex-col gap-4">
      <EmailTemplateHeader />
      <div className="flex w-full gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <BooleanInput
            source="enabled"
            label="Enabled"
            helperText="When disabled, emails for this event are suppressed."
          />
          <TextInput
            source="from"
            label="From"
            helperText="Defaults to the email provider's from-address when empty."
          />
          <TextInput
            source="subject"
            label="Subject"
            helperText="Liquid syntax supported, e.g. {{ tenant.friendly_name }}."
          />
          <CodeInput
            source="body"
            label="Body (HTML + Liquid)"
            language="html"
            height={520}
          />
        </div>
        <aside className="hidden w-[420px] shrink-0 lg:block">
          <div className="sticky top-4 h-[calc(100vh-6rem)]">
            <EmailTemplatePreview
              isOverride={record?.is_override ?? false}
              defaultHtml={record?.default_html}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmailTemplateTitle() {
  const record = useRecordContext<EmailTemplateRecord>();
  const resource = useResourceContext();
  if (!record) return <>{resource}</>;
  return <>{getTemplateLabel(record.template)}</>;
}

export function EmailTemplatesEdit() {
  return (
    <Edit
      mutationMode="pessimistic"
      redirect={false}
      title={<EmailTemplateTitle />}
      transform={transformEmailTemplate}
    >
      <SimpleForm className="max-w-none">
        <EmailTemplateFormContent />
      </SimpleForm>
    </Edit>
  );
}
