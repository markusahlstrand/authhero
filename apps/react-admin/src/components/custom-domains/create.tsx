import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  required,
} from "react-admin";
import { Typography, Divider } from "@mui/material";
import { flattenDomainMetadata } from "./domainMetadataUtils";

export function DomainCreate() {
  return (
    <Create transform={flattenDomainMetadata}>
      <SimpleForm>
        <TextInput source="domain" validate={[required()]} />
        <SelectInput
          source="type"
          validate={[required()]}
          defaultValue="auth0_managed_certs"
          choices={[
            { id: "auth0_managed_certs", name: "Auth0 Managed Certificates" },
            { id: "self_managed_certs", name: "Self Managed Certificates" },
          ]}
        />
        <Divider sx={{ width: "100%", my: 2 }} />
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          SSL Settings
        </Typography>
        <SelectInput
          source="domain_metadata.ssl.certificate_authority"
          label="Certificate Authority"
          emptyText="Default (Cloudflare selects)"
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
