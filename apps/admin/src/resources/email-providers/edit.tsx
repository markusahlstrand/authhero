import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  NumberInput,
} from "@/components/admin";
import { useWatch } from "react-hook-form";
import { SecretInput } from "@/common/SecretInput";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { RawJsonTab } from "@/common/RawJsonTab";

const PROVIDER_CHOICES = [
  { id: "mailgun", name: "Mailgun" },
  { id: "mandrill", name: "Mandrill" },
  { id: "sendgrid", name: "SendGrid" },
  { id: "ses", name: "Amazon SES" },
  { id: "sparkpost", name: "SparkPost" },
  { id: "smtp", name: "SMTP" },
  { id: "azure_cs", name: "Azure Communication Services" },
];

function ProviderCredentials() {
  const provider = useWatch({ name: "name" });

  if (provider === "mailgun") {
    return (
      <>
        <SecretInput source="credentials.api_key" label="API Key" />
        <TextInput source="credentials.domain" label="Domain" />
        <SelectInput
          source="credentials.region"
          label="Region"
          choices={[
            { id: "us", name: "US" },
            { id: "eu", name: "EU" },
          ]}
        />
      </>
    );
  }
  if (provider === "sendgrid" || provider === "mandrill") {
    return <SecretInput source="credentials.api_key" label="API Key" />;
  }
  if (provider === "sparkpost") {
    return (
      <>
        <SecretInput source="credentials.api_key" label="API Key" />
        <SelectInput
          source="credentials.region"
          label="Region"
          choices={[
            { id: "us", name: "US" },
            { id: "eu", name: "EU" },
          ]}
        />
      </>
    );
  }
  if (provider === "ses") {
    return (
      <>
        <TextInput source="credentials.accessKeyId" label="Access Key ID" />
        <SecretInput
          source="credentials.secretAccessKey"
          label="Secret Access Key"
        />
        <TextInput source="credentials.region" label="Region" />
      </>
    );
  }
  if (provider === "smtp") {
    return (
      <>
        <TextInput source="credentials.smtp_host" label="SMTP Host" />
        <NumberInput source="credentials.smtp_port" label="SMTP Port" />
        <TextInput source="credentials.smtp_user" label="SMTP User" />
        <SecretInput source="credentials.smtp_pass" label="SMTP Password" />
      </>
    );
  }
  if (provider === "azure_cs") {
    return (
      <>
        <TextInput source="credentials.tenantId" label="Tenant ID" />
        <TextInput source="credentials.clientId" label="Client ID" />
        <SecretInput source="credentials.clientSecret" label="Client Secret" />
        <TextInput
          source="credentials.connectionString"
          label="Connection String"
        />
      </>
    );
  }
  return null;
}

function ProviderFields() {
  const provider = useWatch({ name: "name" });
  if (!provider) return null;
  return (
    <>
      <BooleanInput source="enabled" defaultValue={true} />
      <TextInput source="default_from_address" label="Default From address" />
      <ProviderCredentials />
    </>
  );
}

export function EmailProvidersEdit() {
  return (
    <Edit mutationMode="pessimistic" redirect={false} title="Email Provider">
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <SelectInput
              source="name"
              label="Provider"
              choices={PROVIDER_CHOICES}
            />
            <ProviderFields />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
