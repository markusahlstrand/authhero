import { useCallback, useEffect, useState } from "react";
import { useNotify } from "ra-core";
import { Loader2 } from "lucide-react";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
  isSingleTenantForDomain,
} from "@/authProvider";
import { useTenantId } from "@/TenantContext";
import {
  buildUrlWithProtocol,
  formatDomain,
  getDomainFromStorage,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";
import { getConfigValue } from "@/utils/runtimeConfig";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_TEMPLATE = `{%- auth0:widget -%}
{%- authhero:logo -%}
{%- authhero:settings -%}
{%- authhero:powered-by -%}
{%- authhero:legal -%}
`;

function getApiUrl(): string {
  const domains = getDomainFromStorage();
  const selectedDomain = getSelectedDomainFromStorage();
  const formattedSelectedDomain = formatDomain(selectedDomain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedSelectedDomain,
  );

  let apiUrl: string;
  if (domainConfig?.restApiUrl) {
    apiUrl = buildUrlWithProtocol(domainConfig.restApiUrl);
  } else if (selectedDomain) {
    apiUrl = buildUrlWithProtocol(selectedDomain);
  } else {
    apiUrl = buildUrlWithProtocol(getConfigValue("apiUrl"));
  }

  return apiUrl.replace(/\/$/, "");
}

function getHttpClient(tenantId: string) {
  const formattedDomain = formatDomain(getSelectedDomainFromStorage());
  if (isSingleTenantForDomain(formattedDomain)) {
    return authorizedHttpClient;
  }
  return createOrganizationHttpClient(tenantId);
}

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
    if (!template.includes("{%- auth0:widget -%}")) {
      notify("Template must contain {%- auth0:widget -%} tag", {
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
        isHttpError(err) && err.message ? err.message : "Failed to save template";
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
          runtime, layout) is fixed by AuthHero — your template only controls
          which corner chips render. Delete a slot to hide that pill.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          <div className="text-sm font-semibold">Slots:</div>
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
        </ul>
      </div>
    </div>
  );
}
