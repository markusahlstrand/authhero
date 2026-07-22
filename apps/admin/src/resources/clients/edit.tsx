import { Edit, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { DetailsTab } from "./tabs/details-tab";
import { SsoTab } from "./tabs/sso-tab";
import { ClientGrantsTab } from "./tabs/client-grants-tab";
import { ConnectionsTab } from "./tabs/connections-tab";
import { OrganizationsTab } from "./tabs/organizations-tab";
import { AdvancedTab } from "./tabs/advanced-tab";
import { RefreshTokensTab } from "./tabs/refresh-tokens-tab";
import { RawJsonTab } from "@/common/RawJsonTab";
import { CimdBanner } from "./cimd";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Drop top-level/legacy `disable_sign_ups` (now on connection.options.disable_signup)
// and strip null values from refresh_token.* so cleared NumberInputs don't
// round-trip null into .optional() schema fields.
function transformClient(data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };

  if (isPlainObject(out.client_metadata)) {
    const stringified: Record<string, string> = {};
    for (const [k, v] of Object.entries(out.client_metadata)) {
      if (k === "disable_sign_ups") continue;
      if (typeof v === "boolean") stringified[k] = v ? "true" : "false";
      else if (v != null) stringified[k] = String(v);
    }
    out.client_metadata = stringified;
  }
  if ("disable_sign_ups" in out) delete out.disable_sign_ups;

  if (isPlainObject(out.refresh_token)) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.refresh_token)) {
      if (v !== null) cleaned[k] = v;
    }
    out.refresh_token = cleaned;
  }

  return out;
}

export function ClientEdit() {
  return (
    <Edit mutationMode="pessimistic" transform={transformClient as never}>
      <SimpleForm className="max-w-none">
        <CimdBanner />
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="sso">SSO</TabsTrigger>
            <TabsTrigger value="grants">Client Grants</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger value="refresh">Refresh Tokens</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <DetailsTab />
          </TabsContent>
          <TabsContent value="sso" className="mt-4">
            <SsoTab />
          </TabsContent>
          <TabsContent value="grants" className="mt-4">
            <ClientGrantsTab />
          </TabsContent>
          <TabsContent value="connections" className="mt-4">
            <ConnectionsTab />
          </TabsContent>
          <TabsContent value="organizations" className="mt-4">
            <OrganizationsTab />
          </TabsContent>
          <TabsContent value="advanced" className="mt-4">
            <AdvancedTab />
          </TabsContent>
          <TabsContent value="refresh" className="mt-4">
            <RefreshTokensTab />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
