import { Edit, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { DetailsTab } from "./tabs/details-tab";
import { MembersTab } from "./tabs/members-tab";
import { RawJsonTab } from "./tabs/raw-json-tab";

export function OrganizationEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <DetailsTab />
          </TabsContent>
          <TabsContent value="members" className="mt-4">
            <MembersTab />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
