import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  required,
  ArrayInput,
  SimpleFormIterator,
  Labeled,
  FieldTitle,
  DateField,
  TextField,
  Toolbar,
  SaveButton,
  useRecordContext,
  useNotify,
  Button,
} from "react-admin";
import { Box } from "@mui/material";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import { fetchUtils } from "react-admin";
import { getConfigValue } from "../../utils/runtimeConfig";
import { buildUrlWithProtocol } from "../../utils/domainUtils";
import { useParams } from "react-router-dom";

const triggerChoices = [
  { id: "post-login", name: "Post Login" },
  { id: "credentials-exchange", name: "Credentials Exchange" },
  { id: "pre-user-registration", name: "Pre User Registration" },
  { id: "post-user-registration", name: "Post User Registration" },
];

function DeployButton() {
  const record = useRecordContext();
  const notify = useNotify();
  const { tenantId } = useParams();

  const handleDeploy = async () => {
    if (!record?.id) return;
    try {
      const domain = getConfigValue("domain") || "";
      const apiUrl = buildUrlWithProtocol(domain);
      const headers = new Headers({ "Content-Type": "application/json" });
      if (tenantId) headers.set("tenant-id", tenantId);

      await fetchUtils.fetchJson(
        `${apiUrl}/api/v2/actions/actions/${record.id}/deploy`,
        { method: "POST", headers },
      );
      notify("Action deployed successfully", { type: "success" });
    } catch (err: any) {
      notify(`Deploy failed: ${err.message}`, { type: "error" });
    }
  };

  return (
    <Button
      label="Deploy"
      onClick={handleDeploy}
      startIcon={<RocketLaunchIcon />}
    />
  );
}

function ActionToolbar() {
  return (
    <Toolbar>
      <SaveButton />
      <Box sx={{ ml: 2 }}>
        <DeployButton />
      </Box>
    </Toolbar>
  );
}

export function ActionEdit() {
  return (
    <Edit
      transform={(data: any) => {
        const {
          id,
          tenant_id,
          created_at,
          updated_at,
          status,
          deployed_at,
          ...rest
        } = data;
        return {
          ...rest,
          supported_triggers: data.trigger_id
            ? [{ id: data.trigger_id }]
            : rest.supported_triggers,
          trigger_id: undefined,
        };
      }}
    >
      <SimpleForm toolbar={<ActionToolbar />}>
        <TextInput source="name" validate={[required()]} fullWidth />
        <SelectInput
          source="trigger_id"
          label="Trigger"
          choices={triggerChoices}
          fullWidth
          format={(value: any) => {
            if (!value) {
              return undefined;
            }
            return value;
          }}
        />
        <TextInput
          source="code"
          validate={[required()]}
          fullWidth
          multiline
          minRows={10}
          sx={{ "& .MuiInputBase-input": { fontFamily: "monospace" } }}
        />
        <TextInput source="runtime" fullWidth />
        <ArrayInput source="secrets">
          <SimpleFormIterator inline>
            <TextInput source="name" label="Name" />
            <TextInput source="value" label="Value" />
          </SimpleFormIterator>
        </ArrayInput>
        <ArrayInput source="dependencies">
          <SimpleFormIterator inline>
            <TextInput source="name" label="Package" />
            <TextInput source="version" label="Version" />
          </SimpleFormIterator>
        </ArrayInput>
        <Labeled label={<FieldTitle source="status" />}>
          <TextField source="status" />
        </Labeled>
        <Labeled label={<FieldTitle source="created_at" />}>
          <DateField source="created_at" showTime />
        </Labeled>
        <Labeled label={<FieldTitle source="updated_at" />}>
          <DateField source="updated_at" showTime />
        </Labeled>
      </SimpleForm>
    </Edit>
  );
}
