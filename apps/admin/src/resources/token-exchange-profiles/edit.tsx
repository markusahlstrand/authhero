import type { RaRecord } from "ra-core";
import { Edit, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { RawJsonTab } from "@/common/RawJsonTab";
import {
  fromProfileUpdateValues,
  toProfileFormValues,
  type ProfileFormValues,
} from "./formMapping";
import { ProfileFields } from "./profile-fields";
import { HowToCall } from "./how-to-call";

export function TokenExchangeProfileEdit() {
  return (
    <Edit
      mutationMode="pessimistic"
      queryOptions={{
        select: (data: RaRecord) => ({
          ...toProfileFormValues(data),
          id: data.id,
        }),
      }}
      transform={(data: ProfileFormValues) => fromProfileUpdateValues(data)}
    >
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Settings</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <div className="flex flex-col gap-6">
              <ProfileFields isEdit />
              <HowToCall />
            </div>
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
