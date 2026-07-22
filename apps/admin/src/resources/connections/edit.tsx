import { Edit, SimpleForm } from "@/components/admin";
import { DeleteButton } from "@/components/admin/delete-button";
import { useRecordContext } from "ra-core";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { isDatabaseConnectionStrategy } from "@/utils/Strategy";
import { DetailsTab } from "./tabs/details-tab";
import { AttributesTab } from "./tabs/attributes-tab";
import { AuthenticationMethodsTab } from "./tabs/authentication-methods-tab";
import { PasswordPolicyTab } from "./tabs/password-policy-tab";
import { ClientsTab } from "./tabs/clients-tab";
import { RawJsonTab } from "@/common/RawJsonTab";
import { TryConnectionButton } from "./try-connection-button";

// Recursively strip null values so cleared inputs don't send "null" to the API.
function stripNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(stripNulls).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => [k, stripNulls(v)])
        .filter(([, v]) => v !== undefined),
    );
  }
  return value;
}

function ConnectionTabs() {
  const record = useRecordContext();
  const isDb = isDatabaseConnectionStrategy(record?.strategy);

  return (
    <UrlTabs defaultValue="details" className="w-full">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        {isDb && <TabsTrigger value="attributes">Attributes</TabsTrigger>}
        {isDb && (
          <TabsTrigger value="auth-methods">Authentication Methods</TabsTrigger>
        )}
        {isDb && (
          <TabsTrigger value="password-policy">Password Policy</TabsTrigger>
        )}
        <TabsTrigger value="clients">Clients</TabsTrigger>
        <TabsTrigger value="raw">Raw JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="mt-4">
        <DetailsTab />
      </TabsContent>
      {isDb && (
        <TabsContent value="attributes" className="mt-4">
          <AttributesTab />
        </TabsContent>
      )}
      {isDb && (
        <TabsContent value="auth-methods" className="mt-4">
          <AuthenticationMethodsTab />
        </TabsContent>
      )}
      {isDb && (
        <TabsContent value="password-policy" className="mt-4">
          <PasswordPolicyTab />
        </TabsContent>
      )}
      <TabsContent value="clients" className="mt-4">
        <ClientsTab />
      </TabsContent>
      <TabsContent value="raw" className="mt-4">
        <RawJsonTab />
      </TabsContent>
    </UrlTabs>
  );
}

export function ConnectionEdit() {
  return (
    <Edit
      mutationMode="pessimistic"
      transform={stripNulls as never}
      actions={
        <div className="flex justify-end items-center gap-2">
          <TryConnectionButton />
          <DeleteButton />
        </div>
      }
    >
      <SimpleForm className="max-w-none">
        <ConnectionTabs />
      </SimpleForm>
    </Edit>
  );
}
