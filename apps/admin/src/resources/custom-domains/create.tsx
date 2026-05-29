import { Create, SimpleForm, TextInput, SelectInput } from "@/components/admin";
import { flattenDomainMetadata } from "@/components/custom-domains/domainMetadataUtils";

export function DomainCreate() {
  return (
    <Create transform={flattenDomainMetadata}>
      <SimpleForm>
        <TextInput source="domain" required />
        <SelectInput
          source="type"
          defaultValue="auth0_managed_certs"
          choices={[
            { id: "auth0_managed_certs", name: "Auth0 Managed Certificates" },
            { id: "self_managed_certs", name: "Self Managed Certificates" },
          ]}
        />
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
          defaultValue="txt"
          choices={[
            { id: "txt", name: "TXT" },
            { id: "http", name: "HTTP" },
            { id: "email", name: "Email" },
          ]}
        />
      </SimpleForm>
    </Create>
  );
}
