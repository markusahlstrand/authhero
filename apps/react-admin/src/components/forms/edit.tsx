import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  TextInput,
  required,
  useRecordContext,
  TabbedForm,
  FormTab,
} from "react-admin";
import FlowEditor from "./FlowEditor";
import { ReactFlowProvider } from "@xyflow/react";
import { Box, Typography, useTheme } from "@mui/material";
import * as React from "react";
import { useSaveContext } from "react-admin";

// A component to render the flow diagram
const FlowDiagram = () => {
  const record = useRecordContext();

  // Allow rendering if there is a start or ending node, even if nodes is missing or empty
  if (!record || (!record.nodes && !record.start && !record.ending)) {
    return <div>No flow data available</div>;
  }

  return (
    <Box
      sx={{
        height: "700px",
        width: "100%",
        border: "1px solid #e0e0e0",
        borderRadius: "4px",
        bgcolor: "#fcfcfc",
      }}
    >
      <ReactFlowProvider>
        <FlowEditor
          nodes={record.nodes || []}
          start={record.start}
          ending={record.ending}
        />
      </ReactFlowProvider>
    </Box>
  );
};

// A component to display raw JSON
const RawJsonEditor = () => {
  const record = useRecordContext();
  const saveContext = useSaveContext();
  const theme = useTheme();
  const [jsonValue, setJsonValue] = React.useState(() =>
    record ? JSON.stringify(record, null, 2) : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  if (!record) {
    return <div>No form data available</div>;
  }

  // Handle JSON edit
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setJsonValue(value);
    setSuccess(false);
    try {
      JSON.parse(value);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Invalid JSON");
    }
  };

  // Save JSON to record
  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      setError(null);
      if (saveContext && typeof saveContext.save === "function") {
        saveContext.save(parsed);
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || "Invalid JSON");
      setSuccess(false);
    }
  };

  // Theme-aware colors
  const isDark = theme.palette.mode === "dark";
  const textareaBg = isDark ? theme.palette.background.paper : "#f5f5f5";
  const textareaBorder = isDark ? theme.palette.divider : "#e0e0e0";
  const textareaColor = isDark ? theme.palette.text.primary : "inherit";

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Raw JSON representation of the form data:
      </Typography>
      <Box
        component="textarea"
        value={jsonValue}
        onChange={handleChange}
        sx={{
          backgroundColor: textareaBg,
          border: `1px solid ${textareaBorder}`,
          borderRadius: "4px",
          color: textareaColor,
          padding: 2,
          maxHeight: "600px",
          minHeight: "300px",
          width: "100%",
          overflow: "auto",
          fontSize: "0.9rem",
          fontFamily: "monospace",
          resize: "vertical",
        }}
      />
      <Box sx={{ mt: 1, display: "flex", gap: 2, alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={!!error || !saveContext?.save}
          style={{
            padding: "6px 16px",
            borderRadius: 4,
            border: `1px solid ${theme.palette.primary.main}`,
            background: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            cursor: error ? "not-allowed" : "pointer",
          }}
        >
          Save JSON
        </button>
        {success && <Typography color="success.main">Saved!</Typography>}
      </Box>
      {error && (
        <Typography color="error" sx={{ mt: 1 }}>
          Invalid JSON: {error}
        </Typography>
      )}
    </Box>
  );
};

export const FormEdit = () => {
  return (
    <Edit>
      <TabbedForm>
        <FormTab label="Basic Information">
          <TextInput source="id" disabled fullWidth />
          <TextInput source="name" validate={[required()]} fullWidth />
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
          <Box sx={{ width: "100%" }}>
            <RawJsonEditor />
          </Box>
        </FormTab>
      </TabbedForm>
    </Edit>
  );
};
