import { useRef } from "react";
import { Edit, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { DetailsTab } from "./tabs/details-tab";
import { TestTab } from "./tabs/test-tab";
import { VersionsTab } from "./tabs/versions-tab";
import { RawJsonTab } from "@/common/RawJsonTab";
import {
  fromActionFormValues,
  toActionFormValues,
  type ActionRecord,
} from "./formMapping";

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
        select: (data: ActionRecord) => toActionFormValues(data, sentinel),
      }}
      transform={(data: ActionRecord) => fromActionFormValues(data, sentinel)}
    >
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Settings</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
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
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
