import { useEffect, useState } from "react";
import { useNotify, useRecordContext } from "ra-core";
import { useWatch } from "react-hook-form";
import { Rocket } from "lucide-react";
import {
  ArrayInput,
  BooleanInput,
  CodeInput,
  SimpleFormIterator,
  TextInput,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function DeployButton() {
  const record = useRecordContext<{ id?: string }>();
  const notify = useNotify();
  const tenantId = useTenantId() ?? "";
  const [busy, setBusy] = useState(false);

  if (!record?.id) return null;

  const handleDeploy = async () => {
    setBusy(true);
    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      await httpClient(`${apiUrl}/api/v2/actions/actions/${record.id}/deploy`, {
        method: "POST",
        body: JSON.stringify({}),
        headers: new Headers({
          "tenant-id": tenantId,
          "content-type": "application/json",
        }),
      });
      notify("Action deployed", { type: "success" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Deploy failed: ${message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleDeploy}
      disabled={busy}
    >
      <Rocket className="h-4 w-4 mr-2" />
      {busy ? "Deploying…" : "Deploy"}
    </Button>
  );
}

function useIsControlPlane(): boolean | undefined {
  const tenantId = useTenantId() ?? "";
  const [isControlPlane, setIsControlPlane] = useState<boolean | undefined>(
    undefined,
  );

  useEffect(() => {
    setIsControlPlane(undefined);
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const apiUrl = getApiUrl();
        const httpClient = getHttpClient(tenantId);
        const response = await httpClient(`${apiUrl}/api/v2/tenants/settings`, {
          headers: new Headers({ "tenant-id": tenantId }),
        });
        const body =
          response && typeof response === "object" && "json" in response
            ? (response as { json?: { is_control_plane?: boolean } }).json
            : undefined;
        if (!cancelled) setIsControlPlane(!!body?.is_control_plane);
      } catch {
        if (!cancelled) setIsControlPlane(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return isControlPlane;
}

function CodeField() {
  const inherit = useWatch({ name: "inherit" }) as boolean | undefined;
  return (
    <CodeInput
      source="code"
      language="javascript"
      height={480}
      readOnly={!!inherit}
      helperText={
        inherit
          ? "Code is read from the control-plane action with the same name at execute time. Clear `Inherit` to edit a local copy."
          : "Edit the action's JavaScript code."
      }
    />
  );
}

export function DetailsTab() {
  const isControlPlane = useIsControlPlane();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Settings</CardTitle>
          <DeployButton />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TextInput source="name" />
          <TextInput source="runtime" />
          {isControlPlane && (
            <BooleanInput
              source="inherit"
              label="Inherit to child tenants"
              helperText="When enabled, child tenants that create an action with this same name will read `code` from this control-plane action at execute time."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Code</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeField />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Secrets</CardTitle>
        </CardHeader>
        <CardContent>
          <ArrayInput source="secrets" label={false}>
            <SimpleFormIterator inline>
              <TextInput source="name" label="Name" />
              <TextInput source="value" label="Value" type="password" />
            </SimpleFormIterator>
          </ArrayInput>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
        </CardHeader>
        <CardContent>
          <ArrayInput source="dependencies" label={false}>
            <SimpleFormIterator inline>
              <TextInput source="name" label="Package" />
              <TextInput source="version" label="Version" />
            </SimpleFormIterator>
          </ArrayInput>
        </CardContent>
      </Card>
    </div>
  );
}
