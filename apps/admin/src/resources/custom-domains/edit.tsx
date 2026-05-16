import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
} from "@/components/admin";
import { SecretInput } from "@/common/SecretInput";
import { flattenDomainMetadata } from "@/components/custom-domains/domainMetadataUtils";

export function DomainEdit() {
  return (
    <Edit transform={flattenDomainMetadata} mutationMode="pessimistic">
      <SimpleForm>
        <TextInput source="domain" />
        <TextInput source="status" readOnly />

        <SelectInput
          source="domain_metadata.ssl.certificate_authority"
          label="Certificate Authority"
          choices={[
            { id: "google", name: "Google Trust Services" },
            { id: "lets_encrypt", name: "Let's Encrypt" },
            { id: "sectigo", name: "Sectigo" },
            { id: "digicert", name: "DigiCert (Enterprise)" },
          ]}
        />
        <SelectInput
          source="domain_metadata.ssl.method"
          label="SSL Verification Method"
          choices={[
            { id: "txt", name: "TXT" },
            { id: "http", name: "HTTP" },
            { id: "email", name: "Email" },
          ]}
        />

        <SelectInput
          source="email_service"
          choices={[
            { id: "mailchannels", name: "Mailchannels" },
            { id: "mailgun", name: "Mailgun" },
          ]}
        />
        <SecretInput
          source="dkim_private_key"
          label="DKIM Private Key (PEM)"
          multiline
        />
        <SecretInput
          source="dkim_public_key"
          label="DKIM Public Key (PEM)"
          multiline
        />
        <SecretInput source="email_api_key" label="Email API Key" />
      </SimpleForm>
    </Edit>
  );
}
