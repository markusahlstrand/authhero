import { useParams, Link } from "react-router-dom";
import { useGetOne, useNotify, useRedirect } from "ra-core";
import { Edit, SimpleForm, TextInput } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { RawJsonTab } from "@/common/RawJsonTab";
import { ArrowLeft } from "lucide-react";

export function ScopeEdit() {
  const { id: rsId, scopeId } = useParams<{ id: string; scopeId: string }>();
  const redirect = useRedirect();
  const notify = useNotify();
  const { data: rs } = useGetOne(
    "resource-servers",
    { id: rsId! },
    { enabled: !!rsId },
  );

  if (!rsId || !scopeId) return null;

  const decodedValue = decodeURIComponent(scopeId);
  const recordId = `${rsId}:${decodedValue}`;
  const listPath = `/resource-servers/${rsId}`;
  const isSystem = !!(rs as { is_system?: boolean })?.is_system;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={listPath}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to scopes
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">
          {isSystem ? "View scope" : "Edit scope"}
          {rs?.name ? ` — ${rs.name}` : ""}
        </h2>
      </div>

      {isSystem && (
        <Alert className="mb-4">
          <AlertDescription>
            Scopes are read-only on system Resource Servers.
          </AlertDescription>
        </Alert>
      )}

      <Edit
        resource="resource-server-scopes"
        id={recordId}
        mutationMode="pessimistic"
        mutationOptions={{
          onSuccess: () => {
            notify("Scope updated");
            redirect(listPath);
          },
        }}
        redirect={false}
      >
        <SimpleForm className="max-w-none">
          <UrlTabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4">
              <TextInput
                source="value"
                label="Scope"
                required
                readOnly={isSystem}
              />
              <TextInput source="description" multiline readOnly={isSystem} />
            </TabsContent>
            <TabsContent value="raw" className="mt-4">
              <RawJsonTab />
            </TabsContent>
          </UrlTabs>
        </SimpleForm>
      </Edit>
    </div>
  );
}
