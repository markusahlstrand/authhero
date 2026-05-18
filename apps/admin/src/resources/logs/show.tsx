import { Show } from "@/components/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailsTab } from "./tabs/details-tab";
import { RawTab } from "./tabs/raw-tab";

export function LogShow() {
  return (
    <Show>
      <Tabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <DetailsTab />
        </TabsContent>
        <TabsContent value="raw" className="mt-4">
          <RawTab />
        </TabsContent>
      </Tabs>
    </Show>
  );
}
