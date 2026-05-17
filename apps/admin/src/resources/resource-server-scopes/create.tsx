import { useParams, Link } from "react-router-dom";
import { useGetOne, useNotify, useRedirect } from "ra-core";
import { Create, SimpleForm, TextInput } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft } from "lucide-react";

export function ScopeCreate() {
  const { id: rsId } = useParams<{ id: string }>();
  const redirect = useRedirect();
  const notify = useNotify();
  const { data: rs } = useGetOne(
    "resource-servers",
    { id: rsId! },
    { enabled: !!rsId },
  );

  if (!rsId) return null;
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
          Add scope{rs?.name ? ` — ${rs.name}` : ""}
        </h2>
      </div>

      {isSystem && (
        <Alert className="mb-4">
          <AlertDescription>
            Scopes cannot be created on system Resource Servers.
          </AlertDescription>
        </Alert>
      )}

      {!isSystem && (
        <Create
          resource="resource-server-scopes"
          transform={(data) => ({ ...data, resource_server_id: rsId })}
          mutationOptions={{
            onSuccess: () => {
              notify("Scope created");
              redirect(listPath);
            },
          }}
          redirect={false}
        >
          <SimpleForm>
            <TextInput
              source="value"
              label="Scope"
              required
              helperText="e.g., read:users, write:posts"
            />
            <TextInput
              source="description"
              multiline
              helperText="What this scope allows"
            />
          </SimpleForm>
        </Create>
      )}
    </div>
  );
}
