import { useCallback, useEffect, useRef, useState } from "react";
import {
  BooleanInput,
  CodeInput,
  Edit,
  SimpleForm,
  TextInput,
} from "@/components/admin";
import type { EditorProps } from "@monaco-editor/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRecordContext, useResourceContext } from "ra-core";
import { Info } from "lucide-react";
import { EmailTemplatePreview } from "./preview";
import { ResetToDefaultButton } from "./reset-to-default-button";
import { SendTestButton } from "./send-test-button";
import { getTemplateDescription, getTemplateLabel } from "./template-names";

type MountedEditor = Parameters<NonNullable<EditorProps["onMount"]>>[0];

interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/**
 * Monaco's `setHiddenAreas` removes line ranges from the editor view without
 * touching the underlying model — used here to fully hide the React Email
 * inbox-preview padding block. The method is real at runtime but not in the
 * public type defs, so we declare it as an optional overlay.
 */
type EditorWithHiddenAreas = MountedEditor & {
  setHiddenAreas?: (ranges: MonacoRange[], source?: unknown) => void;
};

const PREVIEW_PADDING_CHAR = /[\u00A0\u200B-\u200F\u2060\uFEFF]/g;
const HIDDEN_AREA_SOURCE = "email-template-preview-padding";

function findPreviewPaddingRanges(value: string): MonacoRange[] {
  const lines = value.split("\n");
  const ranges: MonacoRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const padCount = line.match(PREVIEW_PADDING_CHAR)?.length ?? 0;
    if (padCount >= 20) {
      ranges.push({
        startLineNumber: i + 1,
        startColumn: 1,
        endLineNumber: i + 1,
        endColumn: line.length + 1,
      });
    }
  }
  return ranges;
}

interface EmailTemplateRecord {
  id: string;
  template: string;
  is_override: boolean;
  default_html?: string;
  default_subject?: string;
  body?: string;
  subject?: string;
  from?: string;
  enabled?: boolean;
}

function pickString(value: unknown, fallback: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof fallback === "string") return fallback;
  return "";
}

function transformEmailTemplate(data: Record<string, unknown>) {
  return {
    template: data.id ?? data.template,
    syntax: "liquid" as const,
    body: pickString(data.body, data.default_html),
    subject: pickString(data.subject, data.default_subject),
    ...(typeof data.from === "string" && data.from.trim() !== ""
      ? { from: data.from }
      : {}),
    ...(typeof data.enabled === "boolean" ? { enabled: data.enabled } : {}),
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{label}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <SendTestButton templateName={record.template} />
      </div>
      {!record.is_override ? (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Pre-filled from bundled default</AlertTitle>
          <AlertDescription>
            No tenant override yet. The fields below are pre-filled from the
            bundled default — save to create an override.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function EmailTemplateFormContent() {
  const record = useRecordContext<EmailTemplateRecord>();
  const subjectPlaceholder = record?.default_subject
    ? `Default: ${record.default_subject}`
    : undefined;
  const [hideInvisibleChars, setHideInvisibleChars] = useState(true);
  const editorRef = useRef<EditorWithHiddenAreas | null>(null);
  const hideRef = useRef(hideInvisibleChars);
  useEffect(() => {
    hideRef.current = hideInvisibleChars;
  }, [hideInvisibleChars]);

  const applyHiddenAreas = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || typeof ed.setHiddenAreas !== "function") return;
    if (!hideRef.current) {
      ed.setHiddenAreas([], HIDDEN_AREA_SOURCE);
      return;
    }
    const value = ed.getModel()?.getValue() ?? "";
    ed.setHiddenAreas(
      findPreviewPaddingRanges(value),
      HIDDEN_AREA_SOURCE,
    );
  }, []);

  useEffect(() => {
    applyHiddenAreas();
  }, [applyHiddenAreas, hideInvisibleChars]);

  const handleEditorMount: NonNullable<EditorProps["onMount"]> = (ed) => {
    editorRef.current = ed;
    ed.onDidChangeModelContent(() => applyHiddenAreas());
    applyHiddenAreas();
  };

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
            placeholder="Defaults to the email provider's from-address"
            helperText="Defaults to the email provider's from-address when empty."
          />
          <TextInput
            source="subject"
            label="Subject"
            placeholder={subjectPlaceholder}
            helperText="Liquid syntax supported. Leave empty to use the bundled default (localized via Liquid variables)."
          />
          <div className="flex flex-col gap-2">
            <CodeInput
              source="body"
              label="Body (HTML + Liquid)"
              language="html"
              height={520}
              onEditorMount={handleEditorMount}
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Templates contain zero-width Unicode characters that pad the
                inbox preview text so email clients don't leak unrelated body
                content into the preview line. They look odd in the editor but
                should not be removed.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  id="hide-invisible"
                  checked={hideInvisibleChars}
                  onCheckedChange={setHideInvisibleChars}
                />
                <Label
                  htmlFor="hide-invisible"
                  className="text-xs text-muted-foreground"
                >
                  Hide invisible characters
                </Label>
              </div>
            </div>
          </div>
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
      actions={<ResetToDefaultButton />}
    >
      <SimpleForm className="max-w-none">
        <EmailTemplateFormContent />
      </SimpleForm>
    </Edit>
  );
}
