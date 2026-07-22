import { lazy, Suspense } from "react";
import { Edit, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailsTab } from "./tabs/details-tab";
import { RawJsonTab } from "@/common/RawJsonTab";

const DesignerTab = lazy(() =>
  import("./tabs/designer-tab").then((m) => ({ default: m.DesignerTab })),
);

export function FormEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="designer">Designer</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <DetailsTab />
          </TabsContent>
          <TabsContent value="designer" className="mt-4">
            <Suspense
              fallback={
                <Skeleton className="h-[calc(100vh-12rem)] min-h-[480px] w-full" />
              }
            >
              <DesignerTab />
            </Suspense>
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
