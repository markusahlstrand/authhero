import {
  Show,
  SimpleShowLayout,
  RecordField,
  TextField,
  DateField,
  ReferenceField,
} from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { RawJsonTab } from "@/common/RawJsonTab";

export function SessionShow() {
  return (
    <Show>
      <UrlTabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <SimpleShowLayout>
            <RecordField source="id">
              <TextField source="id" />
            </RecordField>
            <RecordField source="user_id">
              <ReferenceField source="user_id" reference="users" link="show">
                <TextField source="email" />
              </ReferenceField>
            </RecordField>
            <RecordField source="created_at">
              <DateField source="created_at" showTime />
            </RecordField>
            <RecordField source="used_at">
              <DateField source="used_at" showTime />
            </RecordField>
            <RecordField source="expires_at">
              <DateField source="expires_at" showTime />
            </RecordField>
            <RecordField source="idle_expires_at">
              <DateField source="idle_expires_at" showTime />
            </RecordField>
            <RecordField source="device.last_ip" label="Last IP">
              <TextField source="device.last_ip" />
            </RecordField>
            <RecordField source="device.last_user_agent" label="Last user agent">
              <TextField source="device.last_user_agent" />
            </RecordField>
          </SimpleShowLayout>
        </TabsContent>
        <TabsContent value="raw" className="mt-4">
          <RawJsonTab />
        </TabsContent>
      </UrlTabs>
    </Show>
  );
}
