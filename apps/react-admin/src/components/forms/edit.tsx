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
  useGetList,
  useSaveContext,
} from "react-admin";
import FlowEditor, { FlowNodeData, StartNode, EndingNode } from "./FlowEditor";
import { ReactFlowProvider } from "@xyflow/react";
import { Box, Typography, useTheme } from "@mui/material";
import * as React from "react";
import { useFormContext, useWatch } from "react-hook-form";

// A component to render the flow diagram
const FlowDiagram = () => {
  const record = useRecordContext();
  const form = useFormContext();

  // Watch form values to keep FlowEditor in sync
  const formNodes = useWatch({ name: "nodes" });
  const formStart = useWatch({ name: "start" });
  const formEnding = useWatch({ name: "ending" });

  // Use form values if available, otherwise fall back to record
  const nodes = formNodes ?? record?.nodes ?? [];
  const start = formStart ?? record?.start;
  const ending = formEnding ?? record?.ending;

  // Fetch flows for dropdown selection
  const { data: flows } = useGetList("flows", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  // Allow rendering if there is a start or ending node, even if nodes is missing or empty
  if (!record || (!nodes && !start && !ending)) {
    return <div>No flow data available</div>;
  }

  // Handle node updates from the FlowEditor - uses form context to mark dirty
  const handleNodeUpdate = (
    nodeId: string,
    updates: Partial<FlowNodeData> | Partial<StartNode> | Partial<EndingNode>,
  ) => {
    if (nodeId === "start") {
      // Update the start node
      const currentStart = form.getValues("start") || {};
      form.setValue("start", { ...currentStart, ...updates }, { shouldDirty: true });
    } else if (nodeId === "end") {
      // Update the ending node
      const currentEnding = form.getValues("ending") || {};
      form.setValue("ending", { ...currentEnding, ...updates }, { shouldDirty: true });
    } else {
      // Check if this is a new node (has 'type' property in updates indicating full node data)
      const isNewNode =
        "type" in updates && (updates as FlowNodeData).type !== undefined;

      const currentNodes = form.getValues("nodes") || [];

      if (isNewNode) {
        // Adding a new node
        const newNode = { id: nodeId, ...updates } as FlowNodeData;
        form.setValue("nodes", [...currentNodes, newNode], { shouldDirty: true });
      } else {
        // Update an existing node
        const nodeIndex = currentNodes.findIndex(
          (n: FlowNodeData) => n.id === nodeId,
        );
        if (nodeIndex >= 0) {
          const existingNode = currentNodes[nodeIndex];
          const updatedNodes = [...currentNodes];
          updatedNodes[nodeIndex] = {
            ...existingNode,
            ...updates,
            config: {
              ...existingNode.config,
              ...(updates as Partial<FlowNodeData>).config,
            },
          };
          form.setValue("nodes", updatedNodes, { shouldDirty: true });
        }
      }
    }
  };

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
          nodes={nodes}
          start={start}
          ending={ending}
          flows={flows?.map((f) => ({ id: f.id, name: f.name })) || []}
          onNodeUpdate={handleNodeUpdate}
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

  // Sync jsonValue with record when it changes (e.g., after flow diagram updates)
  React.useEffect(() => {
    if (record) {
      setJsonValue(JSON.stringify(record, null, 2));
      setError(null);
      setSuccess(false);
    }
  }, [record]);

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
