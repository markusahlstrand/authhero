import { useCallback, useEffect, useState } from "react";
import { useNotify } from "ra-core";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTenantId } from "@/TenantContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getApiUrl, getHttpClient, openFullPreview } from "./previewClient";

const DEFAULT_TEMPLATE = `<div class="ah-widget-stack">
  <div class="ah-above-widget" data-ah-slot="above-widget"></div>
  {%- auth0:widget -%}
  <div class="ah-below-widget" data-ah-slot="below-widget"></div>
</div>
{%- authhero:logo -%}
{%- authhero:settings -%}
{%- authhero:powered-by -%}
{%- authhero:legal -%}
`;

/** Matches the widget mount tag in any valid Liquid spelling. */
const WIDGET_TAG_RE = /\{%-?\s*auth0\s*:\s*widget\s*-?%\}/;

interface HttpError {
  status?: number;
  message?: string;
}

function isHttpError(err: unknown): err is HttpError {
  return typeof err === "object" && err !== null;
}

export function UniversalLoginTab() {
  const notify = useNotify();
  const tenantId = useTenantId() ?? "";

  const [template, setTemplate] = useState("");
  const [originalTemplate, setOriginalTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTemplate, setHasTemplate] = useState(false);

  const fetchTemplate = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      const url = `${apiUrl}/api/v2/branding/templates/universal-login`;

      const response = await httpClient(url, {
        headers: new Headers({ "tenant-id": tenantId }),
      });

      const body =
        response && typeof response === "object" && "json" in response
          ? (response as { json?: { body?: string } }).json?.body
          : undefined;

      if (typeof body === "string") {
        const isCustom = body !== DEFAULT_TEMPLATE;
        setTemplate(body);
        setOriginalTemplate(body);
        setHasTemplate(isCustom);
      }
    } catch (err: unknown) {
      if (isHttpError(err) && err.status === 404) {
        setTemplate("");
        setOriginalTemplate("");
        setHasTemplate(false);
      } else {
        setError("Failed to load template");
        console.error("Error fetching template:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  const handleSave = async () => {
    if (!tenantId) return;
    if (!WIDGET_TAG_RE.test(template)) {
      notify("Template must contain the {%- auth0:widget -%} tag", {
        type: "error",
      });
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      await httpClient(`${apiUrl}/api/v2/branding/templates/universal-login`, {
        method: "PUT",
        headers: new Headers({
          "tenant-id": tenantId,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ body: template }),
      });

      setOriginalTemplate(template);
      setHasTemplate(true);
      notify("Template saved successfully", { type: "success" });
    } catch (err: unknown) {
      const msg =
        isHttpError(err) && err.message
          ? err.message
          : "Failed to save template";
      setError(msg);
      notify("Failed to save template", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tenantId) return;
    if (
      !window.confirm(
        "Are you sure you want to delete the custom template? The default template will be used instead.",
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      await httpClient(`${apiUrl}/api/v2/branding/templates/universal-login`, {
        method: "DELETE",
        headers: new Headers({ "tenant-id": tenantId }),
      });

      setTemplate("");
      setOriginalTemplate("");
      setHasTemplate(false);
      notify("Template deleted successfully", { type: "success" });
    } catch (err: unknown) {
      const msg =
        isHttpError(err) && err.message
          ? err.message
          : "Failed to delete template";
      setError(msg);
      notify("Failed to delete template", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleUseDefault = () => setTemplate(DEFAULT_TEMPLATE);

  const handleOpenFullPreview = async () => {
    if (!tenantId) return;
    try {
      // Send the current editor body so the preview reflects unsaved edits.
      await openFullPreview({ tenantId, screen: "login", body: template });
    } catch {
      notify("Failed to open preview", { type: "error" });
    }
  };

  const hasChanges = template !== originalTemplate;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">Universal Login Page Template</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize the Universal Login body. The page shell (CSS, dark-mode
          runtime, layout) is fixed by AuthHero — your template controls which
          corner chips render and any content placed around the widget. The body
          is rendered with Liquid, so you can use variables and{" "}
          <code>{"{% if %}"}</code> logic. Delete a slot to hide that pill.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          <div className="text-sm font-semibold">Corner slots:</div>
          <ul className="ml-5 mt-2 list-disc space-y-1 text-sm">
            <li>
              <code>{"{%- auth0:widget -%}"}</code> — login widget mount
              (required)
            </li>
            <li>
              <code>{"{%- authhero:logo -%}"}</code> — top-left logo chip
            </li>
            <li>
              <code>{"{%- authhero:settings -%}"}</code> — top-right settings
              chip (dark-mode toggle + language picker)
            </li>
            <li>
              <code>{"{%- authhero:dark-mode-toggle -%}"}</code> — dark-mode
              button only
            </li>
            <li>
              <code>{"{%- authhero:language-picker -%}"}</code> — language
              picker only
            </li>
            <li>
              <code>{"{%- authhero:powered-by -%}"}</code> — bottom-left
              powered-by chip
            </li>
            <li>
              <code>{"{%- authhero:legal -%}"}</code> — bottom-right legal chip
            </li>
          </ul>
          <div className="mt-3 text-sm font-semibold">
            Above / below the widget:
          </div>
          <p className="mt-1 text-sm">
            Wrap the widget in <code>{'<div class="ah-widget-stack">'}</code>{" "}
            and add <code>{'<div class="ah-above-widget">'}</code> /{" "}
            <code>{'<div class="ah-below-widget">'}</code> regions to place your
            own in-flow content (a heading, a notice, support links). Empty
            regions collapse automatically.
          </p>
          <div className="mt-3 text-sm font-semibold">Chip styling:</div>
          <p className="mt-1 text-sm">
            Corner chips render as a pill over a background image and as plain
            text on a solid background. Force one with the slot{"'"}s style
            argument, e.g. <code>{'{%- authhero:legal style="plain" -%}'}</code>{" "}
            or <code>{'style="pill"'}</code> (default <code>auto</code>).
          </p>
          <div className="mt-3 text-sm font-semibold">
            Migrating from Auth0?
          </div>
          <p className="mt-1 text-sm">
            Paste a full HTML document (with <code>{"<html>"}</code> and{" "}
            <code>{"{%- auth0:head -%}"}</code>) and it renders as the whole
            page instead of the fixed shell — your document owns its layout and
            CSS, and <code>{"{%- auth0:head -%}"}</code> injects the widget
            script and styles it needs.
          </p>
          <a
            href="https://auth0.com/docs/authenticate/login/auth0-universal-login/new-experience/universal-login-page-templates"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-primary underline"
          >
            Learn more about page templates
          </a>
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Textarea
        rows={20}
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        placeholder="Enter your custom HTML template..."
        className="font-mono text-xs"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !template || !hasChanges}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save Template"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={handleOpenFullPreview}>
          <ExternalLink className="size-4" />
          Open full preview
        </Button>
        {!template && (
          <Button type="button" variant="outline" onClick={handleUseDefault}>
            Use Default Template
          </Button>
        )}
        {hasTemplate && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={saving}
          >
            Delete Template
          </Button>
        )}
        {hasChanges && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTemplate(originalTemplate)}
            disabled={saving}
          >
            Discard Changes
          </Button>
        )}
      </div>

      {hasChanges && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          You have unsaved changes
        </p>
      )}

      <div className="mt-4 border-t pt-4">
        <div className="text-sm font-medium text-muted-foreground">
          Template Variables
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          You can use Liquid variables to customize your template:
        </p>
        <ul className="ml-5 mt-2 list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <code>{"{{ branding.logo_url }}"}</code> — Your logo URL
          </li>
          <li>
            <code>{"{{ branding.colors.primary }}"}</code> — Primary color
          </li>
          <li>
            <code>{"{{ prompt.screen.name }}"}</code> — Current screen name
          </li>
          <li>
            <code>{"{{ page.has_background_image }}"}</code> — true when a
            background image is set
          </li>
          <li>
            <code>{"{{ page.dark_mode }}"}</code> — <code>auto</code> /{" "}
            <code>light</code> / <code>dark</code>
          </li>
          <li>
            <code>{"{{ page.logo_position }}"}</code> /{" "}
            <code>{"{{ page.layout }}"}</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
