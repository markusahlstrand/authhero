import {
  ArrayField,
  DateField,
  Datagrid,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  useRecordContext,
} from "react-admin";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { SecretInput } from "../common/SecretInput";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import { Typography, Box, Divider } from "@mui/material";
import { flattenDomainMetadata } from "./domainMetadataUtils";

const StatusField = () => {
  const record = useRecordContext();
  if (!record) return null;

  const isActive = record.status === "active";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        color: isActive ? "success.main" : "warning.main",
      }}
    >
      {isActive ? (
        <CheckCircleIcon sx={{ mr: 1 }} fontSize="small" />
      ) : (
        <HourglassEmptyIcon sx={{ mr: 1 }} fontSize="small" />
      )}
      <Typography
        component="span"
        variant="body2"
        sx={{
          fontWeight: "medium",
          textTransform: "capitalize",
        }}
      >
        {record.status}
      </Typography>
    </Box>
  );
};

export function DomainEdit() {
  return (
    <Edit transform={flattenDomainMetadata} mutationMode="pessimistic">
      <SimpleForm>
        <TextInput source="domain" />
        <Labeled label="Status">
          <StatusField />
        </Labeled>
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
          choices={[
            { id: "txt", name: "TXT" },
            { id: "http", name: "HTTP" },
            { id: "email", name: "Email" },
          ]}
        />
        <Divider sx={{ width: "100%", my: 2 }} />
        <SelectInput
          source="email_service"
          choices={[
            { id: "mailchannels", name: "Mailchannels" },
            { id: "mailgun", name: "Mailgun" },
          ]}
        />
        <SecretInput
          label="PEM Private Key"
          source="dkim_private_key"
          style={{ width: "800px" }}
        />
        <SecretInput
          label="PEM Public Key"
          source="dkim_public_key"
          style={{ width: "800px" }}
        />
        <SecretInput
          label="Api Key"
          source="email_api_key"
          style={{ width: "800px" }}
        />
        <Labeled label="Verification Methods">
          <ArrayField source="verification.methods">
            <Datagrid bulkActionButtons={false}>
              <TextField source="name" />
              <TextField source="record" style={{ fontFamily: "monospace" }} />
              <TextField source="domain" />
            </Datagrid>
          </ArrayField>
        </Labeled>
        <Labeled label={<FieldTitle source="created_at" />}>
          <DateField source="created_at" showTime={true} />
        </Labeled>
        <Labeled label={<FieldTitle source="updated_at" />}>
          <DateField source="updated_at" showTime={true} />
        </Labeled>
      </SimpleForm>
    </Edit>
  );
}
