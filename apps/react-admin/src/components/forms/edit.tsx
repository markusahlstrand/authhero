import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  TextInput,
  required,
  ArrayInput,
  SimpleFormIterator,
  NumberInput,
  useRecordContext,
  TabbedForm,
  FormTab,
} from "react-admin";
import FlowEditor from "./FlowEditor";
import { ReactFlowProvider } from "@xyflow/react";
import { Box, Typography } from "@mui/material";

// A component to render the flow diagram
const FlowDiagram = () => {
  const record = useRecordContext();

  if (!record || !record.nodes) {
    return <div>No flow data available</div>;
  }

  return (
    <div
      style={{
        height: "600px",
        width: "100%",
        border: "1px solid #e0e0e0",
        borderRadius: "4px",
      }}
    >
      <ReactFlowProvider>
        <FlowEditor
          nodes={record.nodes || []}
          start={record.start}
          ending={record.ending}
        />
      </ReactFlowProvider>
    </div>
  );
};

// A component to display raw JSON
const RawJsonEditor = () => {
  const record = useRecordContext();

  if (!record) {
    return <div>No form data available</div>;
  }

  // Create a formatted string of the JSON data
  const formattedJson = JSON.stringify(record, null, 2);

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Raw JSON representation of the form data:
      </Typography>

      <Box
        component="pre"
        sx={{
          backgroundColor: "#f5f5f5",
          border: "1px solid #e0e0e0",
          borderRadius: "4px",
          padding: 2,
          maxHeight: "600px",
          overflow: "auto",
          fontSize: "0.9rem",
          fontFamily: "monospace",
        }}
      >
        {formattedJson}
      </Box>
    </Box>
  );
};

export const FormEdit = () => {
  return (
    <Edit>
      <TabbedForm>
        <FormTab label="Basic Information">
          <TextInput source="id" disabled />
          <TextInput source="name" validate={[required()]} />
          <SelectInput
            source="type"
            validate={[required()]}
            choices={[
              { id: "classic", name: "Classic" },
              { id: "page", name: "Page" },
            ]}
          />
          <ArrayInput source="layout.fields">
            <SimpleFormIterator>
              <TextInput source="id" validate={[required()]} />
              <TextInput source="label" validate={[required()]} />
              <SelectInput
                source="type"
                choices={[
                  { id: "text", name: "Text" },
                  { id: "email", name: "Email" },
                  { id: "password", name: "Password" },
                  { id: "checkbox", name: "Checkbox" },
                  { id: "select", name: "Select" },
                ]}
                validate={[required()]}
              />
              <NumberInput source="order" />
              <TextInput source="placeholder" />
              <TextInput source="description" />
              <SelectInput
                source="required"
                choices={[
                  { id: true, name: "True" },
                  { id: false, name: "False" },
                ]}
              />
            </SimpleFormIterator>
          </ArrayInput>
          <Labeled label={<FieldTitle source="created_at" />}>
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label={<FieldTitle source="updated_at" />}>
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </FormTab>

        <FormTab label="Flow Diagram">
          <FlowDiagram />
        </FormTab>

        <FormTab label="Raw">
          <RawJsonEditor />
        </FormTab>
      </TabbedForm>
    </Edit>
  );
};
