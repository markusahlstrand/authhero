import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Drawer,
  TextField,
  Button,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  FormHelperText,
  Switch,
  FormControlLabel,
  Tab,
  Tabs,
  Paper,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import CodeIcon from "@mui/icons-material/Code";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { Node } from "@xyflow/react";

import type {
  ComponentConfig,
  FlowNodeData,
  StartNode,
  EndingNode,
} from "./FlowEditor";

interface NodeEditorProps {
  open: boolean;
  selectedNode: Node | null;
  nodes: FlowNodeData[];
  start?: StartNode;
  ending?: EndingNode;
  onClose: () => void;
  onNodeUpdate: (
    nodeId: string,
    updates: Partial<FlowNodeData> | Partial<StartNode> | Partial<EndingNode>,
  ) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`node-editor-tabpanel-${index}`}
      aria-labelledby={`node-editor-tab-${index}`}
      {...other}
      style={{ padding: "16px 0" }}
    >
      {value === index && children}
    </div>
  );
};

export const NodeEditor: React.FC<NodeEditorProps> = ({
  open,
  selectedNode,
  nodes,
  start,
  ending,
  onClose,
  onNodeUpdate,
}) => {
  const [tabValue, setTabValue] = useState(0);
  const [formData, setFormData] = useState<any>({});

  // Initialize form data when selected node changes
  useEffect(() => {
    if (!selectedNode) {
      setFormData({});
      return;
    }

    if (selectedNode.id === "start" && start) {
      setFormData({
        next_node: start.next_node || "",
      });
    } else if (selectedNode.id === "end" && ending) {
      setFormData({
        resume_flow: ending.resume_flow || false,
      });
    } else {
      // Find the node data in the nodes array
      const nodeData = nodes.find((node) => node.id === selectedNode.id);
      if (nodeData) {
        setFormData({
          id: nodeData.id,
          alias: nodeData.alias || "",
          type: nodeData.type,
          next_node: nodeData.config?.next_node || "",
          components: nodeData.config?.components || [],
          flow_id: nodeData.config?.flow_id || "",
        });
      }
    }
  }, [selectedNode, nodes, start, ending]);

  const handleInputChange = useCallback(
    (
      e:
        | React.ChangeEvent<HTMLInputElement>
        | {
            target: { name?: string; value: unknown };
          },
    ) => {
      const { name, value } = e.target;
      if (name) {
        setFormData((prev: any) => ({
          ...prev,
          [name]: value,
        }));
      }
    },
    [],
  );

  const handleSwitchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, checked } = e.target;
      if (name) {
        setFormData((prev: any) => ({
          ...prev,
          [name]: checked,
        }));
      }
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (!selectedNode) return;

    if (selectedNode.id === "start") {
      onNodeUpdate("start", { next_node: formData.next_node || undefined });
    } else if (selectedNode.id === "end") {
      onNodeUpdate("end", { resume_flow: formData.resume_flow || false });
    } else {
      const updates: Partial<FlowNodeData> = {
        alias: formData.alias,
        config: {
          next_node: formData.next_node || undefined,
          components: formData.components || [],
        },
      };

      if (selectedNode.type === "flow") {
        updates.config!.flow_id = formData.flow_id;
      }

      onNodeUpdate(selectedNode.id, updates);
    }
    onClose();
  }, [selectedNode, formData, onNodeUpdate, onClose]);

  // Render the proper editor based on node type
  const renderEditor = () => {
    if (!selectedNode) return null;

    switch (selectedNode.type) {
      case "start":
        return renderStartNodeEditor();
      case "end":
        return renderEndNodeEditor();
      case "step":
        return renderStepNodeEditor();
      case "flow":
        return renderFlowNodeEditor();
      default:
        return (
          <Typography color="text.secondary">
            Unknown node type: {selectedNode.type}
          </Typography>
        );
    }
  };

  const renderStartNodeEditor = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Start Node
      </Typography>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="next-node-label">Next Node</InputLabel>
        <Select
          labelId="next-node-label"
          id="next-node"
          name="next_node"
          value={formData.next_node || ""}
          label="Next Node"
          onChange={handleInputChange}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {nodes.map((node) => (
            <MenuItem key={node.id} value={node.id}>
              {node.alias || node.id}
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>Select the first node in the flow</FormHelperText>
      </FormControl>
    </Box>
  );

  const renderEndNodeEditor = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        End Node
      </Typography>
      <FormControlLabel
        control={
          <Switch
            name="resume_flow"
            checked={!!formData.resume_flow}
            onChange={handleSwitchChange}
          />
        }
        label="Resume authentication flow"
      />
      <FormHelperText>
        When enabled, the flow will resume the authentication process after
        completion
      </FormHelperText>
    </Box>
  );

  const renderStepNodeEditor = () => (
    <Box>
      <TextField
        fullWidth
        label="Node Alias"
        name="alias"
        value={formData.alias || ""}
        onChange={handleInputChange}
        margin="normal"
        helperText="A friendly name for this step"
      />

      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel id="next-node-label">Next Node</InputLabel>
        <Select
          labelId="next-node-label"
          id="next-node"
          name="next_node"
          value={formData.next_node || ""}
          label="Next Node"
          onChange={handleInputChange}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {nodes
            .filter((node) => node.id !== selectedNode?.id)
            .map((node) => (
              <MenuItem key={node.id} value={node.id}>
                {node.alias || node.id}
              </MenuItem>
            ))}
          <MenuItem value="$ending">End Flow</MenuItem>
        </Select>
      </FormControl>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        Components
      </Typography>

      {formData.components && formData.components.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          {formData.components.map((component: ComponentConfig) => (
            <Paper key={component.id} sx={{ p: 2, mb: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2">{component.type}</Typography>
                <IconButton size="small" aria-label="edit component">
                  <EditIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {component.type === "RICH_TEXT" && component.config?.content
                  ? `Content: ${component.config.content.substring(0, 30)}...`
                  : component.type === "LEGAL" && component.config?.text
                    ? `Text: ${component.config.text}`
                    : component.type === "NEXT_BUTTON" && component.config?.text
                      ? `Button text: ${component.config.text}`
                      : component.id}
              </Typography>
            </Paper>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No components added to this step.
        </Typography>
      )}

      <Button
        variant="outlined"
        startIcon={<AddCircleOutlineIcon />}
        fullWidth
        sx={{ mt: 2 }}
      >
        Add Component
      </Button>
    </Box>
  );

  const renderFlowNodeEditor = () => (
    <Box>
      <TextField
        fullWidth
        label="Flow ID"
        name="flow_id"
        value={formData.flow_id || ""}
        onChange={handleInputChange}
        margin="normal"
        helperText="ID of the flow to update"
      />

      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel id="next-node-label">Next Node</InputLabel>
        <Select
          labelId="next-node-label"
          id="next-node"
          name="next_node"
          value={formData.next_node || ""}
          label="Next Node"
          onChange={handleInputChange}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {nodes
            .filter((node) => node.id !== selectedNode?.id)
            .map((node) => (
              <MenuItem key={node.id} value={node.id}>
                {node.alias || node.id}
              </MenuItem>
            ))}
          <MenuItem value="$ending">End Flow</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        flexShrink: 0,
        width: 350,
        "& .MuiDrawer-paper": {
          width: 350,
          boxSizing: "border-box",
          padding: 2,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ display: "block" }}>
            {selectedNode
              ? selectedNode.id === "start"
                ? "Start Node"
                : selectedNode.id === "end"
                  ? "End Node"
                  : String(selectedNode?.data?.label || "Node")
              : "Node"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {selectedNode?.id || ""}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
        >
          <Tab label="Properties" />
          <Tab label="JSON" />
        </Tabs>
      </Box>

      <Box sx={{ mt: 2, mb: 2 }}>
        <TabPanel value={tabValue} index={0}>
          {renderEditor()}
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ position: "relative" }}>
            <IconButton
              size="small"
              sx={{ position: "absolute", top: 0, right: 0 }}
              title="Copy JSON"
            >
              <CodeIcon fontSize="small" />
            </IconButton>
            <Typography
              component="pre"
              sx={{
                p: 1,
                backgroundColor: "#f5f5f5",
                borderRadius: 1,
                overflow: "auto",
                fontSize: "0.8rem",
                maxHeight: "400px",
              }}
            >
              {JSON.stringify(
                selectedNode?.id === "start"
                  ? { next_node: formData.next_node || null, id: "start" }
                  : selectedNode?.id === "end"
                    ? { resume_flow: formData.resume_flow || false, id: "end" }
                    : formData,
                null,
                2,
              )}
            </Typography>
          </Box>
        </TabPanel>
      </Box>

      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          backgroundColor: "background.paper",
          pt: 2,
          pb: 2,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          justifyContent: "flex-end",
          gap: 1,
        }}
      >
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" color="primary" onClick={handleSave}>
          Save
        </Button>
      </Box>
    </Drawer>
  );
};

export default NodeEditor;
