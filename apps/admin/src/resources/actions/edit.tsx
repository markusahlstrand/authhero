import { useRef } from "react";
import { Edit, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { DetailsTab } from "./tabs/details-tab";
import { TestTab } from "./tabs/test-tab";
import { VersionsTab } from "./tabs/versions-tab";

type Secret = { name: string; value?: string };
type Trigger = { id?: string };

type ActionRecord = {
  id: string | number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
  deployed_at?: string;
  supported_triggers?: Trigger[];
  secrets?: Secret[];
  trigger_id?: string;
} & Record<string, unknown>;

export function ActionEdit() {
  // Per-mount sentinel that a user cannot reproduce as a real secret value, so
  // unchanged-secret detection in `transform` only matches values we ourselves
  // wrote in `select`.
  const sentinelRef = useRef<string>("");
  if (!sentinelRef.current) {
    sentinelRef.current = `__authhero_unchanged_secret_${crypto.randomUUID()}__`;
  }
  const sentinel = sentinelRef.current;

  return (
    <Edit
      mutationMode="pessimistic"
      queryOptions={{
        select: (data: ActionRecord) => ({
          ...data,
          trigger_id: data.supported_triggers?.[0]?.id,
          secrets: data.secrets?.map((s) => ({
            name: s.name,
            value: sentinel,
          })),
        }),
      }}
      transform={(data: ActionRecord) => {
        const {
          id: _id,
          tenant_id: _tenant_id,
          created_at: _created_at,
          updated_at: _updated_at,
          status: _status,
          deployed_at: _deployed_at,
          trigger_id,
          ...rest
        } = data;
        const cleanedSecrets = (rest.secrets ?? [])
          .filter((s): s is Secret => !!s?.name)
          .map((s) =>
            s.value === sentinel
              ? { name: s.name }
              : { name: s.name, value: s.value },
          );
        return {
          ...rest,
          supported_triggers: trigger_id
            ? [{ id: trigger_id }]
            : rest.supported_triggers,
          secrets: cleanedSecrets,
        };
      }}
    >
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Settings</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <DetailsTab />
          </TabsContent>
          <TabsContent value="test" className="mt-4">
            <TestTab />
          </TabsContent>
          <TabsContent value="versions" className="mt-4">
            <VersionsTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
