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
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import { Typography, Box } from "@mui/material";

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
    <Edit>
      <SimpleForm>
        <TextInput source="domain" />
        <Labeled label="Status">
          <StatusField />
        </Labeled>
        <SelectInput
          source="email_service"
          choices={[
            { id: "mailchannels", name: "Mailchannels" },
            { id: "mailgun", name: "Mailgun" },
          ]}
        />
        <TextInput
          label="PEM Private Key"
          source="dkim_private_key"
          style={{ width: "800px" }}
          multiline={true}
        />
        <TextInput
          label="PEM Public Key"
          source="dkim_public_key"
          style={{ width: "800px" }}
          multiline={true}
        />
        <TextInput
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
