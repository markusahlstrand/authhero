import { Edit, SimpleForm } from "@/components/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailsTab } from "./tabs/details-tab";
import { FlowTab } from "./tabs/flow-tab";
import { RawJsonTab } from "./tabs/raw-json-tab";

export function FormEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm className="max-w-none">
        <Tabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <DetailsTab />
          </TabsContent>
          <TabsContent value="flow" className="mt-4">
            <FlowTab />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </Tabs>
      </SimpleForm>
    </Edit>
  );
}
