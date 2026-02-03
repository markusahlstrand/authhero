import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  Link,
} from "@mui/material";
import { useNotify } from "react-admin";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
} from "../../authProvider";
import {
  getDomainFromStorage,
  buildUrlWithProtocol,
  formatDomain,
  getSelectedDomainFromStorage,
} from "../../utils/domainUtils";

// Get tenantId from the URL path (e.g., /breakit/branding -> breakit)
function getTenantIdFromPath(): string {
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  return pathSegments[0] || "";
}

// Default template with required Liquid tags
const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    {%- auth0:head -%}
  </head>
  <body>
    {%- auth0:widget -%}
  </body>
</html>`;

function getApiUrl(): string {
  const domains = getDomainFromStorage();
  const selectedDomain = getSelectedDomainFromStorage();
  const formattedSelectedDomain = formatDomain(selectedDomain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedSelectedDomain
  );

  let apiUrl: string;

  if (domainConfig?.restApiUrl) {
    apiUrl = buildUrlWithProtocol(domainConfig.restApiUrl);
  } else if (selectedDomain) {
    apiUrl = buildUrlWithProtocol(selectedDomain);
  } else {
    apiUrl = buildUrlWithProtocol(import.meta.env.VITE_AUTH0_API_URL || "");
  }

  return apiUrl.replace(/\/$/, "");
}

function getHttpClient(tenantId: string) {
  // Check single-tenant mode at request time
  const storedFlag = sessionStorage.getItem("isSingleTenant");
  const isSingleTenant =
    storedFlag?.endsWith("|true") || storedFlag === "true";

  // In single-tenant mode, use the regular authorized client without organization scope
  // In multi-tenant mode, use organization-scoped client for proper access control
  if (isSingleTenant) {
    return authorizedHttpClient;
  } else {
    return createOrganizationHttpClient(tenantId);
  }
}

export function UniversalLoginTab() {
  const notify = useNotify();
  const tenantId = getTenantIdFromPath();

  const [template, setTemplate] = useState<string>("");
  const [originalTemplate, setOriginalTemplate] = useState<string>("");
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
        headers: new Headers({
          "tenant-id": tenantId,
        }),
      });

      if (response.json?.body) {
        setTemplate(response.json.body);
        setOriginalTemplate(response.json.body);
        setHasTemplate(true);
      }
    } catch (err: any) {
      if (err.status === 404) {
        // No template exists yet, that's fine
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

    // Validate template
    if (!template.includes("{%- auth0:head -%}")) {
      notify("Template must contain {%- auth0:head -%} tag", { type: "error" });
      return;
    }
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
      await httpClient(
        `${apiUrl}/api/v2/branding/templates/universal-login`,
        {
          method: "PUT",
          headers: new Headers({
            "tenant-id": tenantId,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ body: template }),
        }
      );

      setOriginalTemplate(template);
      setHasTemplate(true);
      notify("Template saved successfully", { type: "success" });
    } catch (err: any) {
      setError(err.message || "Failed to save template");
      notify("Failed to save template", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tenantId) return;

    if (
      !window.confirm(
        "Are you sure you want to delete the custom template? The default template will be used instead."
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      await httpClient(
        `${apiUrl}/api/v2/branding/templates/universal-login`,
        {
          method: "DELETE",
          headers: new Headers({
            "tenant-id": tenantId,
          }),
        }
      );

      setTemplate("");
      setOriginalTemplate("");
      setHasTemplate(false);
      notify("Template deleted successfully", { type: "success" });
    } catch (err: any) {
      setError(err.message || "Failed to delete template");
      notify("Failed to delete template", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleUseDefault = () => {
    setTemplate(DEFAULT_TEMPLATE);
  };

  const hasChanges = template !== originalTemplate;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Universal Login Page Template
      </Typography>

      <Typography variant="body2" sx={{ mb: 3, color: "text.secondary" }}>
        Customize the HTML template for your Universal Login page. The template
        uses Liquid templating syntax and must include the required{" "}
        <code>{"{%- auth0:head -%}"}</code> and{" "}
        <code>{"{%- auth0:widget -%}"}</code> tags.
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Required tags:</strong>
          <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
            <li>
              <code>{"{%- auth0:head -%}"}</code> - Must be placed in the{" "}
              <code>&lt;head&gt;</code> section
            </li>
            <li>
              <code>{"{%- auth0:widget -%}"}</code> - Must be placed in the{" "}
              <code>&lt;body&gt;</code> section where you want the login widget
            </li>
          </ul>
          <Link
            href="https://auth0.com/docs/authenticate/login/auth0-universal-login/new-experience/universal-login-page-templates"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more about page templates
          </Link>
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <TextField
          multiline
          fullWidth
          minRows={15}
          maxRows={30}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="Enter your custom HTML template..."
          sx={{
            "& .MuiInputBase-root": {
              fontFamily: "monospace",
              fontSize: "13px",
            },
            "& .MuiOutlinedInput-notchedOutline": {
              border: "none",
            },
          }}
        />
      </Paper>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !template || !hasChanges}
        >
          {saving ? <CircularProgress size={20} /> : "Save Template"}
        </Button>

        {!template && (
          <Button variant="outlined" onClick={handleUseDefault}>
            Use Default Template
          </Button>
        )}

        {hasTemplate && (
          <Button
            variant="outlined"
            color="error"
            onClick={handleDelete}
            disabled={saving}
          >
            Delete Template
          </Button>
        )}

        {hasChanges && (
          <Button
            variant="text"
            onClick={() => setTemplate(originalTemplate)}
            disabled={saving}
          >
            Discard Changes
          </Button>
        )}
      </Box>

      {hasChanges && (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 1, color: "warning.main" }}
        >
          You have unsaved changes
        </Typography>
      )}

      <Divider sx={{ my: 4 }} />

      <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
        Template Variables
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        You can use Liquid variables to customize your template:
        <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
          <li>
            <code>{"{{ branding.logo_url }}"}</code> - Your logo URL
          </li>
          <li>
            <code>{"{{ branding.colors.primary }}"}</code> - Primary color
          </li>
          <li>
            <code>{"{{ prompt.screen.name }}"}</code> - Current screen name
          </li>
        </ul>
      </Typography>
    </Box>
  );
}
