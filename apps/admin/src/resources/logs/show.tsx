import { Show } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { DetailsTab } from "./tabs/details-tab";
import { RawTab } from "./tabs/raw-tab";

export function LogShow() {
  return (
    <Show>
      <UrlTabs defaultValue="details" className="w-full">
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
      </UrlTabs>
    </Show>
  );
}
