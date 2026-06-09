import { Edit, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { transformForUpdate } from "@/components/custom-domains/domainMetadataUtils";
import { CertificateTab } from "./tabs/certificate-tab";
import { DetailsTab } from "./tabs/details-tab";
import { ProxyTab } from "./tabs/proxy-tab";
import { RawJsonTab } from "./tabs/raw-json-tab";

export function DomainEdit() {
  return (
    <Edit transform={transformForUpdate} mutationMode="pessimistic">
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="certificate">Certificate</TabsTrigger>
            <TabsTrigger value="proxy">Proxy</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <DetailsTab />
          </TabsContent>
          <TabsContent value="certificate" className="mt-4">
            <CertificateTab />
          </TabsContent>
          <TabsContent value="proxy" className="mt-4">
            <ProxyTab />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
