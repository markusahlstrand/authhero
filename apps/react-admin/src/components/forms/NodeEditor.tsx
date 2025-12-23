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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  ListItemIcon,
  ListItemText,
  Autocomplete,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import CodeIcon from "@mui/icons-material/Code";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import GavelIcon from "@mui/icons-material/Gavel";
import SmartButtonIcon from "@mui/icons-material/SmartButton";
import ShortTextIcon from "@mui/icons-material/ShortText";
import EmailIcon from "@mui/icons-material/Email";
import NumbersIcon from "@mui/icons-material/Numbers";
import PhoneIcon from "@mui/icons-material/Phone";
import { Node } from "@xyflow/react";

import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

import RichTextEditor from "./RichTextEditor";

// Available fields for router condition rules
// These are the user context fields that can be used in router conditions
const ROUTER_FIELD_OPTIONS = [
  {
    value: "{{context.user.email}}",
    label: "User Email",
    description: "The user's email address",
  },
  {
    value: "{{context.user.email_verified}}",
    label: "Email Verified",
    description: "Whether the user's email is verified (true/false)",
  },
  {
    value: "{{context.user.name}}",
    label: "Name",
    description: "The user's full name",
  },
  {
    value: "{{context.user.given_name}}",
    label: "Given Name",
    description: "The user's first/given name",
  },
  {
    value: "{{context.user.family_name}}",
    label: "Family Name",
    description: "The user's last/family name",
  },
  {
    value: "{{context.user.nickname}}",
    label: "Nickname",
    description: "The user's nickname",
  },
  {
    value: "{{context.user.picture}}",
    label: "Picture URL",
    description: "URL to the user's profile picture",
  },
  {
    value: "{{context.user.locale}}",
    label: "Locale",
    description: "The user's locale/language preference",
  },
  {
    value: "{{context.user.username}}",
    label: "Username",
    description: "The user's username",
  },
  {
    value: "{{context.user.phone_number}}",
    label: "Phone Number",
    description: "The user's phone number",
  },
  {
    value: "{{context.user.connection}}",
    label: "Connection",
    description: "The authentication connection used",
  },
  {
    value: "{{context.user.provider}}",
    label: "Provider",
    description: "The authentication provider (e.g., auth0, google)",
  },
  {
    value: "{{context.user.is_social}}",
    label: "Is Social",
    description: "Whether the user logged in via social provider (true/false)",
  },
  {
    value: "{{context.user.user_id}}",
    label: "User ID",
    description: "The unique user identifier",
  },
];

import type {
  ComponentConfig,
  FlowNodeData,
  FlowChoice,
  RouterRule,
  StartNode,
  EndingNode,
} from "./FlowEditor";

interface NodeEditorProps {
  open: boolean;
  selectedNode: Node | null;
  nodes: FlowNodeData[];
  start?: StartNode;
  ending?: EndingNode;
  flows?: FlowChoice[];
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
  flows,
  onClose,
  onNodeUpdate,
}) => {
  const [tabValue, setTabValue] = useState(0);
  const [formData, setFormData] = useState<any>({});
  const [editingComponent, setEditingComponent] =
    useState<ComponentConfig | null>(null);
  const [componentDialogOpen, setComponentDialogOpen] = useState(false);
  const [addComponentAnchor, setAddComponentAnchor] =
    useState<null | HTMLElement>(null);

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
          rules: nodeData.config?.rules || [],
          fallback: nodeData.config?.fallback || "",
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

  // Component editing handlers
  const handleEditComponent = useCallback((component: ComponentConfig) => {
    setEditingComponent({ ...component });
    setComponentDialogOpen(true);
  }, []);

  const handleCloseComponentDialog = useCallback(() => {
    setComponentDialogOpen(false);
    setEditingComponent(null);
  }, []);

  const handleSaveComponent = useCallback(() => {
    if (!editingComponent) return;

    setFormData((prev: any) => ({
      ...prev,
      components: prev.components.map((c: ComponentConfig) =>
        c.id === editingComponent.id ? editingComponent : c,
      ),
    }));
    handleCloseComponentDialog();
  }, [editingComponent, handleCloseComponentDialog]);

  const handleComponentFieldChange = useCallback(
    (field: string, value: string) => {
      setEditingComponent((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          config: {
            ...prev.config,
            [field]: value,
          },
        };
      });
    },
    [],
  );

  const handleAddComponent = useCallback((type: ComponentConfig["type"]) => {
    const getDefaultConfig = () => {
      switch (type) {
        case "RICH_TEXT":
          return { content: "" };
        case "LEGAL":
          return { text: "" };
        case "NEXT_BUTTON":
          return { text: "Continue" };
        case "TEXT":
          return { label: "Text Field", placeholder: "" };
        case "EMAIL":
          return { label: "Email", placeholder: "Enter your email" };
        case "NUMBER":
          return { label: "Number", placeholder: "" };
        case "PHONE":
          return { label: "Phone", placeholder: "Enter your phone number" };
        default:
          return {};
      }
    };

    const newComponent: ComponentConfig = {
      id: `component_${Date.now()}`,
      type,
      config: getDefaultConfig(),
    };
    setFormData((prev: any) => ({
      ...prev,
      components: [...(prev.components || []), newComponent],
    }));
    // Open the editor for the new component
    setEditingComponent(newComponent);
    setComponentDialogOpen(true);
  }, []);

  const handleMoveComponent = useCallback(
    (index: number, direction: "up" | "down") => {
      setFormData((prev: any) => {
        const components = [...(prev.components || [])];
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= components.length) return prev;

        // Swap components
        [components[index], components[newIndex]] = [
          components[newIndex],
          components[index],
        ];
        return { ...prev, components };
      });
    },
    [],
  );

  const handleDeleteComponent = useCallback((componentId: string) => {
    setFormData((prev: any) => ({
      ...prev,
      components: (prev.components || []).filter(
        (c: ComponentConfig) => c.id !== componentId,
      ),
    }));
  }, []);

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

      if (selectedNode.type === "router") {
        updates.config!.rules = formData.rules;
        updates.config!.fallback = formData.fallback || undefined;
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
      case "router":
        return renderRouterNodeEditor();
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

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        Components
      </Typography>

      {formData.components && formData.components.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          {formData.components.map(
            (component: ComponentConfig, index: number) => (
              <Paper key={component.id} sx={{ p: 2, mb: 1 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2">{component.type}</Typography>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <IconButton
                      size="small"
                      aria-label="move up"
                      onClick={() => handleMoveComponent(index, "up")}
                      disabled={index === 0}
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="move down"
                      onClick={() => handleMoveComponent(index, "down")}
                      disabled={index === formData.components.length - 1}
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="edit component"
                      onClick={() => handleEditComponent(component)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="delete component"
                      onClick={() => handleDeleteComponent(component.id)}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {component.type === "RICH_TEXT" && component.config?.content
                    ? `Content: ${component.config.content.substring(0, 30)}...`
                    : component.type === "LEGAL" && component.config?.text
                      ? `Text: ${component.config.text}`
                      : component.type === "NEXT_BUTTON" &&
                          component.config?.text
                        ? `Button text: ${component.config.text}`
                        : (component.type === "TEXT" ||
                              component.type === "EMAIL" ||
                              component.type === "NUMBER" ||
                              component.type === "PHONE") &&
                            component.config?.label
                          ? `Label: ${component.config.label}`
                          : component.id}
                </Typography>
              </Paper>
            ),
          )}
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
        onClick={(e) => setAddComponentAnchor(e.currentTarget)}
      >
        Add Component
      </Button>
      <Menu
        anchorEl={addComponentAnchor}
        open={Boolean(addComponentAnchor)}
        onClose={() => setAddComponentAnchor(null)}
      >
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: "text.secondary", display: "block" }}
        >
          Content
        </Typography>
        <MenuItem
          onClick={() => {
            handleAddComponent("RICH_TEXT");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <TextFieldsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rich Text</ListItemText>
        </MenuItem>
        <Divider />
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: "text.secondary", display: "block" }}
        >
          Fields
        </Typography>
        <MenuItem
          onClick={() => {
            handleAddComponent("TEXT");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <ShortTextIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Text Field</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleAddComponent("EMAIL");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <EmailIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Email Field</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleAddComponent("NUMBER");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <NumbersIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Number Field</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleAddComponent("PHONE");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <PhoneIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Phone Field</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleAddComponent("LEGAL");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <GavelIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Legal Checkbox</ListItemText>
        </MenuItem>
        <Divider />
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: "text.secondary", display: "block" }}
        >
          Actions
        </Typography>
        <MenuItem
          onClick={() => {
            handleAddComponent("NEXT_BUTTON");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <SmartButtonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Next Button</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );

  const renderFlowNodeEditor = () => (
    <Box>
      <FormControl fullWidth margin="normal">
        <InputLabel id="flow-id-label">Flow</InputLabel>
        <Select
          labelId="flow-id-label"
          name="flow_id"
          value={formData.flow_id || ""}
          onChange={handleInputChange}
          label="Flow"
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {flows?.map((flow) => (
            <MenuItem key={flow.id} value={flow.id}>
              {flow.name} ({flow.id})
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>Select the flow to execute</FormHelperText>
      </FormControl>
    </Box>
  );

  const handleRuleChange = useCallback(
    (ruleId: string, field: keyof RouterRule, value: any) => {
      setFormData((prev: any) => ({
        ...prev,
        rules: prev.rules.map((rule: RouterRule) =>
          rule.id === ruleId ? { ...rule, [field]: value } : rule,
        ),
      }));
    },
    [],
  );

  const handleAddRule = useCallback(() => {
    const newRule: RouterRule = {
      id: `rule_${Date.now()}`,
      alias: "",
      condition: {},
      next_node: "",
    };
    setFormData((prev: any) => ({
      ...prev,
      rules: [...(prev.rules || []), newRule],
    }));
  }, []);

  const handleDeleteRule = useCallback((ruleId: string) => {
    setFormData((prev: any) => ({
      ...prev,
      rules: prev.rules.filter((rule: RouterRule) => rule.id !== ruleId),
    }));
  }, []);

  const renderRouterNodeEditor = () => (
    <Box>
      <TextField
        fullWidth
        label="Router Alias"
        name="alias"
        value={formData.alias || ""}
        onChange={handleInputChange}
        margin="normal"
        helperText="A friendly name for this router"
      />

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        Rules
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Rules are evaluated in order. The first matching rule determines the
        next node.
      </Typography>

      {formData.rules && formData.rules.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          {formData.rules.map((rule: RouterRule, index: number) => (
            <Paper key={rule.id} sx={{ p: 2, mb: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2">Rule {index + 1}</Typography>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteRule(rule.id)}
                  aria-label="delete rule"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>

              <TextField
                fullWidth
                label="Rule Alias"
                value={rule.alias || ""}
                onChange={(e) =>
                  handleRuleChange(rule.id, "alias", e.target.value)
                }
                margin="dense"
                size="small"
              />

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 1, mb: 0.5 }}
              >
                Condition
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <Autocomplete
                  freeSolo
                  size="small"
                  options={ROUTER_FIELD_OPTIONS}
                  getOptionLabel={(option) =>
                    typeof option === "string" ? option : option.value
                  }
                  value={rule.condition?.field || ""}
                  onChange={(_, newValue) => {
                    const fieldValue =
                      typeof newValue === "string"
                        ? newValue
                        : newValue?.value || "";
                    handleRuleChange(rule.id, "condition", {
                      ...rule.condition,
                      field: fieldValue,
                    });
                  }}
                  onInputChange={(_, inputValue) => {
                    handleRuleChange(rule.id, "condition", {
                      ...rule.condition,
                      field: inputValue,
                    });
                  }}
                  renderOption={(props, option) => (
                    <Box component="li" {...props}>
                      <Box>
                        <Typography variant="body2">{option.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.value}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Field"
                      placeholder="Select or type a field"
                      helperText="e.g., {{context.user.email}}"
                    />
                  )}
                  sx={{ flex: 1, minWidth: "200px" }}
                />
                <FormControl size="small" sx={{ minWidth: "120px" }}>
                  <InputLabel id={`rule-operator-${rule.id}-label`}>
                    Operator
                  </InputLabel>
                  <Select
                    labelId={`rule-operator-${rule.id}-label`}
                    value={rule.condition?.operator || ""}
                    label="Operator"
                    onChange={(e) =>
                      handleRuleChange(rule.id, "condition", {
                        ...rule.condition,
                        operator: e.target.value,
                      })
                    }
                  >
                    <MenuItem value="equals">equals</MenuItem>
                    <MenuItem value="not_equals">not equals</MenuItem>
                    <MenuItem value="contains">contains</MenuItem>
                    <MenuItem value="not_contains">not contains</MenuItem>
                    <MenuItem value="starts_with">starts with</MenuItem>
                    <MenuItem value="ends_with">ends with</MenuItem>
                    <MenuItem value="exists">exists</MenuItem>
                    <MenuItem value="not_exists">not exists</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Value"
                  value={rule.condition?.value || ""}
                  onChange={(e) =>
                    handleRuleChange(rule.id, "condition", {
                      ...rule.condition,
                      value: e.target.value,
                    })
                  }
                  size="small"
                  sx={{ flex: 1, minWidth: "100px" }}
                  placeholder="e.g., admin"
                  disabled={
                    rule.condition?.operator === "exists" ||
                    rule.condition?.operator === "not_exists"
                  }
                />
              </Box>
            </Paper>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No rules defined. Add a rule to route to different nodes based on
          conditions.
        </Typography>
      )}

      <Button
        variant="outlined"
        startIcon={<AddCircleOutlineIcon />}
        fullWidth
        sx={{ mt: 2 }}
        onClick={handleAddRule}
      >
        Add Rule
      </Button>
    </Box>
  );

  return (
    <>
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
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark"
                      ? theme.palette.grey[900]
                      : "#f5f5f5",
                  color: "text.primary",
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
                      ? {
                          resume_flow: formData.resume_flow || false,
                          id: "end",
                        }
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
            px: 2,
            mx: -2,
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

      {/* Component Edit Dialog */}
      <Dialog
        open={componentDialogOpen}
        onClose={handleCloseComponentDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit {editingComponent?.type} Component</DialogTitle>
        <DialogContent>
          {editingComponent?.type === "RICH_TEXT" && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Content
              </Typography>
              <RichTextEditor
                value={editingComponent?.config?.content || ""}
                onChange={(value) =>
                  handleComponentFieldChange("content", value)
                }
              />
              <FormHelperText>Rich text content with formatting</FormHelperText>
            </Box>
          )}
          {editingComponent?.type === "LEGAL" && (
            <TextField
              fullWidth
              label="Legal Text"
              value={editingComponent?.config?.text || ""}
              onChange={(e) =>
                handleComponentFieldChange("text", e.target.value)
              }
              margin="normal"
              multiline
              rows={3}
              helperText="Text for the legal checkbox"
            />
          )}
          {editingComponent?.type === "NEXT_BUTTON" && (
            <TextField
              fullWidth
              label="Button Text"
              value={editingComponent?.config?.text || ""}
              onChange={(e) =>
                handleComponentFieldChange("text", e.target.value)
              }
              margin="normal"
              helperText="Text to display on the button"
            />
          )}
          {(editingComponent?.type === "TEXT" ||
            editingComponent?.type === "EMAIL" ||
            editingComponent?.type === "NUMBER" ||
            editingComponent?.type === "PHONE") && (
            <Box>
              <TextField
                fullWidth
                label="Label"
                value={editingComponent?.config?.label || ""}
                onChange={(e) =>
                  handleComponentFieldChange("label", e.target.value)
                }
                margin="normal"
                helperText="Label displayed above the field"
              />
              <TextField
                fullWidth
                label="Placeholder"
                value={editingComponent?.config?.placeholder || ""}
                onChange={(e) =>
                  handleComponentFieldChange("placeholder", e.target.value)
                }
                margin="normal"
                helperText="Placeholder text shown when field is empty"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseComponentDialog}>Cancel</Button>
          <Button
            onClick={handleSaveComponent}
            variant="contained"
            color="primary"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default NodeEditor;
