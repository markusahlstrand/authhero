import { Edit, SimpleForm, TextInput, SelectInput } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { regex, required } from "ra-core";
import { RawJsonTab } from "@/common/RawJsonTab";
import {
  contentFormatChoices,
  statusChoices,
  typeChoices,
} from "./logStreamConstants";

function DetailsTab() {
  return (
    <>
      <TextInput source="name" validate={[required()]} />
      <SelectInput
        source="type"
        choices={typeChoices}
        validate={[required()]}
        disabled
        helperText="Type cannot be changed after creation"
      />
      <SelectInput
        source="status"
        choices={statusChoices}
        validate={[required()]}
      />
      <TextInput
        source="sink.http_endpoint"
        label="HTTP endpoint"
        validate={[
          required(),
          regex(/^https?:\/\/[^\s]+$/i, "Must be a valid http(s) URL"),
        ]}
      />
      <TextInput
        source="sink.http_authorization"
        label="Authorization header"
        helperText='Sent verbatim as the Authorization header (e.g. "Basic …" or "Bearer …")'
      />
      <TextInput source="sink.http_content_type" label="Content-Type" />
      <SelectInput
        source="sink.http_content_format"
        label="Content format"
        choices={contentFormatChoices}
      />
    </>
  );
}

export function LogStreamEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <DetailsTab />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
