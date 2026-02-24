import React, { useState, useEffect, useCallback, useRef } from "react";
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
import ArrowDropDownCircleIcon from "@mui/icons-material/ArrowDropDownCircle";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import IntegrationInstructionsIcon from "@mui/icons-material/IntegrationInstructions";
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
  {
    value: "{{context.user.user_metadata.country}}",
    label: "Country (user_metadata)",
    description: "The user's country from user_metadata",
  },
  {
    value: "{{context.user.user_metadata.gender}}",
    label: "Gender (user_metadata)",
    description: "The user's gender from user_metadata",
  },
  {
    value: "{{context.user.user_metadata.birthdate}}",
    label: "Birthdate (user_metadata)",
    description: "The user's birthdate from user_metadata",
  },
  {
    value: "{{context.user.user_metadata.address}}",
    label: "Address (user_metadata)",
    description: "The user's address from user_metadata",
  },
  {
    value: "{{context.user.user_metadata.phone}}",
    label: "Phone (user_metadata)",
    description: "The user's phone from user_metadata",
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

/**
 * Converts a label to a snake_case ID, matching Auth0's convention.
 * e.g. "Privacy Policies" → "privacy_policies", "birthdate" → "birthdate"
 */
function labelToId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Returns a unique component ID by appending _1, _2, … when `baseId`
 * already exists in the list. `excludeId` lets us skip the component
 * that is currently being renamed so it doesn't collide with itself.
 */
function uniqueComponentId(
  baseId: string,
  existing: { id: string }[],
  excludeId?: string,
): string {
  const ids = new Set(
    existing.filter((c) => c.id !== excludeId).map((c) => c.id),
  );
  if (!ids.has(baseId)) return baseId;
  let n = 1;
  while (ids.has(`${baseId}_${n}`)) n++;
  return `${baseId}_${n}`;
}

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

  // Track which node ID we've initialized for to avoid re-initializing on prop changes
  const initializedForNodeId = useRef<string | null>(null);

  // Track last propagated data to prevent loops
  const lastPropagatedData = useRef<string | null>(null);

  // Initialize form data when selected node changes (only when node ID changes)
  useEffect(() => {
    if (!selectedNode) {
      setFormData({});
      initializedForNodeId.current = null;
      lastPropagatedData.current = null;
      return;
    }

    // Only initialize if we haven't already initialized for this node
    if (initializedForNodeId.current === selectedNode.id) {
      return;
    }

    initializedForNodeId.current = selectedNode.id;

    let newFormData: any = {};

    if (selectedNode.id === "start" && start) {
      newFormData = {
        next_node: start.next_node || "",
      };
    } else if (selectedNode.id === "end" && ending) {
      newFormData = {
        resume_flow: ending.resume_flow || false,
      };
    } else {
      // Find the node data in the nodes array
      const nodeData = nodes.find((node) => node.id === selectedNode.id);
      if (nodeData) {
        newFormData = {
          id: nodeData.id,
          alias: nodeData.alias || "",
          type: nodeData.type,
          next_node: nodeData.config?.next_node || "",
          components: nodeData.config?.components || [],
          flow_id: nodeData.config?.flow_id || "",
          rules: nodeData.config?.rules || [],
          fallback: nodeData.config?.fallback || "",
        };
      }
    }

    // Set last propagated data to the initial value to prevent immediate propagation
    lastPropagatedData.current = JSON.stringify(newFormData);
    setFormData(newFormData);
  }, [selectedNode?.id, nodes, start, ending]);

  // Reset initialization tracking when drawer closes
  useEffect(() => {
    if (!open) {
      initializedForNodeId.current = null;
      lastPropagatedData.current = null;
    }
  }, [open]);

  // Propagate changes to parent whenever formData changes (but not on initial load)
  useEffect(() => {
    if (!selectedNode || !initializedForNodeId.current) return;

    // Serialize current form data to compare
    const serialized = JSON.stringify(formData);
    
    // Skip if this is the same data we just propagated or just initialized
    if (lastPropagatedData.current === serialized) {
      return;
    }

    // Skip if formData is empty (not yet initialized)
    if (Object.keys(formData).length === 0) {
      return;
    }

    lastPropagatedData.current = serialized;

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
  }, [formData, selectedNode, onNodeUpdate]);

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

    // Update the component ID based on the label (Auth0-style) when it has a label
    const updatedComponent = { ...editingComponent };
    if (updatedComponent.label) {
      updatedComponent.id = uniqueComponentId(
        labelToId(updatedComponent.label),
        formData.components || [],
        editingComponent.id,
      );
    }

    setFormData((prev: any) => ({
      ...prev,
      components: prev.components.map((c: ComponentConfig) =>
        c.id === editingComponent.id ? updatedComponent : c,
      ),
    }));
    handleCloseComponentDialog();
  }, [editingComponent, handleCloseComponentDialog]);

  const handleComponentFieldChange = useCallback(
    (field: string, value: any) => {
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
    const getDefaultConfig = (): ComponentConfig["config"] => {
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
        case "TEL":
          return { label: "Phone", placeholder: "Enter your phone number" };
        case "DROPDOWN":
          return { options: [], multiple: false };
        case "DATE":
          return { format: "DATE" as const };
        case "CHOICE":
          return { options: [], multiple: false };
        case "CUSTOM":
          return { schema: {}, code: "" };
        default:
          return {};
      }
    };

    const getDefaultLabel = () => {
      switch (type) {
        case "DROPDOWN":
          return "Dropdown";
        case "DATE":
          return "Date";
        case "CHOICE":
          return "Choice";
        case "CUSTOM":
          return "Custom";
        default:
          return undefined;
      }
    };

    const getCategory = (): "BLOCK" | "FIELD" | undefined => {
      switch (type) {
        case "RICH_TEXT":
        case "NEXT_BUTTON":
          return "BLOCK";
        case "TEXT":
        case "EMAIL":
        case "NUMBER":
        case "TEL":
        case "DROPDOWN":
        case "DATE":
        case "CHOICE":
        case "CUSTOM":
        case "LEGAL":
          return "FIELD";
        default:
          return undefined;
      }
    };

    const defaultLabel = getDefaultLabel();
    // Generate ID from label (Auth0-style) for field components, with random suffix as fallback
    const baseId = defaultLabel
      ? labelToId(defaultLabel)
      : `${type.toLowerCase()}_${Math.random().toString(36).substring(2, 6)}`;
    // Avoid duplicate IDs when adding multiple components of the same type
    const id = uniqueComponentId(
      baseId,
      // Read from latest formData via the updater; here we just reference the
      // outer closure which is fine for the add-component path.
      formData.components || [],
    );
    const newComponent: ComponentConfig = {
      id,
      type,
      category: getCategory(),
      label: defaultLabel,
      required: false,
      sensitive: false,
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
                              component.type === "TEL") &&
                            component.config?.label
                          ? `Label: ${component.config.label}`
                          : (component.type === "DROPDOWN" ||
                                component.type === "DATE" ||
                                component.type === "CHOICE" ||
                                component.type === "CUSTOM") &&
                              component.label
                            ? `Label: ${component.label}`
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
            handleAddComponent("TEL");
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
        <MenuItem
          onClick={() => {
            handleAddComponent("DROPDOWN");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <ArrowDropDownCircleIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Dropdown</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleAddComponent("DATE");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <CalendarTodayIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Date / Time</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleAddComponent("CHOICE");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <RadioButtonCheckedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Choice</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleAddComponent("CUSTOM");
            setAddComponentAnchor(null);
          }}
        >
          <ListItemIcon>
            <IntegrationInstructionsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Custom Field</ListItemText>
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
      condition: {
        type: "and",
        conditions: [{ field: "", operator: "", value: "" }],
      },
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
        next node. Add multiple conditions per rule that must ALL match (AND
        logic).
      </Typography>

      {formData.rules && formData.rules.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          {formData.rules.map((rule: RouterRule, index: number) => {
            // Support both old single condition format and new array format
            const conditions = Array.isArray(rule.condition?.conditions)
              ? rule.condition.conditions
              : rule.condition?.field
                ? [rule.condition]
                : [];

            return (
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
                  sx={{ display: "block", mt: 2, mb: 1 }}
                >
                  Conditions (all must match)
                </Typography>

                {conditions.map(
                  (
                    cond: { field?: string; operator?: string; value?: string },
                    condIndex: number,
                  ) => (
                    <Box
                      key={condIndex}
                      sx={{
                        display: "flex",
                        gap: 1,
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                        mb: 1,
                        p: 1,
                        bgcolor: "action.hover",
                        borderRadius: 1,
                      }}
                    >
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={ROUTER_FIELD_OPTIONS}
                        getOptionLabel={(option) =>
                          typeof option === "string" ? option : option.value
                        }
                        value={cond?.field || ""}
                        onChange={(_, newValue) => {
                          const fieldValue =
                            typeof newValue === "string"
                              ? newValue
                              : newValue?.value || "";
                          const newConditions = [...conditions];
                          newConditions[condIndex] = {
                            ...newConditions[condIndex],
                            field: fieldValue,
                          };
                          handleRuleChange(rule.id, "condition", {
                            type: "and",
                            conditions: newConditions,
                          });
                        }}
                        onInputChange={(_, inputValue) => {
                          const newConditions = [...conditions];
                          newConditions[condIndex] = {
                            ...newConditions[condIndex],
                            field: inputValue,
                          };
                          handleRuleChange(rule.id, "condition", {
                            type: "and",
                            conditions: newConditions,
                          });
                        }}
                        renderOption={(props, option) => (
                          <Box component="li" {...props}>
                            <Box>
                              <Typography variant="body2">
                                {option.label}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
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
                          />
                        )}
                        sx={{ flex: 1, minWidth: "180px" }}
                      />
                      <FormControl size="small" sx={{ minWidth: "110px" }}>
                        <InputLabel
                          id={`rule-operator-${rule.id}-${condIndex}-label`}
                        >
                          Operator
                        </InputLabel>
                        <Select
                          labelId={`rule-operator-${rule.id}-${condIndex}-label`}
                          value={cond?.operator || ""}
                          label="Operator"
                          onChange={(e) => {
                            const newConditions = [...conditions];
                            newConditions[condIndex] = {
                              ...newConditions[condIndex],
                              operator: e.target.value,
                            };
                            handleRuleChange(rule.id, "condition", {
                              type: "and",
                              conditions: newConditions,
                            });
                          }}
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
                        value={cond?.value || ""}
                        onChange={(e) => {
                          const newConditions = [...conditions];
                          newConditions[condIndex] = {
                            ...newConditions[condIndex],
                            value: e.target.value,
                          };
                          handleRuleChange(rule.id, "condition", {
                            type: "and",
                            conditions: newConditions,
                          });
                        }}
                        size="small"
                        sx={{ flex: 1, minWidth: "80px" }}
                        placeholder="Value"
                        disabled={
                          cond?.operator === "exists" ||
                          cond?.operator === "not_exists"
                        }
                      />
                      <IconButton
                        size="small"
                        onClick={() => {
                          const newConditions = conditions.filter(
                            (_: any, i: number) => i !== condIndex,
                          );
                          handleRuleChange(rule.id, "condition", {
                            type: "and",
                            conditions: newConditions,
                          });
                        }}
                        disabled={conditions.length <= 1}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ),
                )}

                <Button
                  size="small"
                  onClick={() => {
                    const newConditions = [
                      ...conditions,
                      { field: "", operator: "", value: "" },
                    ];
                    handleRuleChange(rule.id, "condition", {
                      type: "and",
                      conditions: newConditions,
                    });
                  }}
                  startIcon={<AddCircleOutlineIcon />}
                  sx={{ mt: 1 }}
                >
                  Add Condition
                </Button>

                <FormControl fullWidth margin="normal" size="small">
                  <InputLabel id={`rule-next-node-${rule.id}-label`}>
                    Next Node
                  </InputLabel>
                  <Select
                    labelId={`rule-next-node-${rule.id}-label`}
                    value={rule.next_node || ""}
                    label="Next Node"
                    onChange={(e) =>
                      handleRuleChange(rule.id, "next_node", e.target.value)
                    }
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    <MenuItem value="$ending">End (Resume Flow)</MenuItem>
                    {nodes.map((node) => (
                      <MenuItem key={node.id} value={node.id}>
                        {node.alias || node.id} ({node.type})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Paper>
            );
          })}
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

      <Divider sx={{ my: 3 }} />

      <FormControl fullWidth size="small">
        <InputLabel id="fallback-node-label">Fallback Node</InputLabel>
        <Select
          labelId="fallback-node-label"
          name="fallback"
          value={formData.fallback || ""}
          onChange={handleInputChange}
          label="Fallback Node"
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          <MenuItem value="$ending">End (Resume Flow)</MenuItem>
          {nodes.map((node) => (
            <MenuItem key={node.id} value={node.id}>
              {node.alias || node.id} ({node.type})
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>
          Node to go to if no rules match
        </FormHelperText>
      </FormControl>
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
            Close
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
            editingComponent?.type === "TEL") && (
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
              <Autocomplete
                freeSolo
                options={ROUTER_FIELD_OPTIONS}
                getOptionLabel={(option) =>
                  typeof option === "string" ? option : option.label
                }
                value={
                  ROUTER_FIELD_OPTIONS.find(
                    (opt) =>
                      opt.value === editingComponent?.config?.default_value,
                  ) || (editingComponent?.config?.default_value as string) || ""
                }
                onChange={(_e, newValue) => {
                  const val =
                    newValue === null
                      ? ""
                      : typeof newValue === "string"
                        ? newValue
                        : newValue.value;
                  handleComponentFieldChange("default_value", val);
                }}
                onInputChange={(_e, newInput, reason) => {
                  if (reason === "input") {
                    handleComponentFieldChange("default_value", newInput);
                  }
                }}
                renderOption={(props, option) => (
                  <li {...props} key={typeof option === "string" ? option : option.value}>
                    <Box>
                      <Typography variant="body2">
                        {typeof option === "string" ? option : option.label}
                      </Typography>
                      {typeof option !== "string" && option.description && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                        >
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    label="Default Value"
                    margin="normal"
                    helperText="Pre-fill from user profile, e.g. {{context.user.user_metadata.birthdate}}"
                  />
                )}
              />
            </Box>
          )}
          {editingComponent?.type === "DROPDOWN" && (
            <Box>
              <TextField
                fullWidth
                label="Label"
                value={editingComponent?.label || ""}
                onChange={(e) => {
                  setEditingComponent((prev: any) => ({
                    ...prev,
                    label: e.target.value,
                  }));
                }}
                margin="normal"
                helperText="Label displayed above the dropdown"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editingComponent?.config?.multiple || false}
                    onChange={(e) =>
                      handleComponentFieldChange("multiple", e.target.checked)
                    }
                  />
                }
                label="Allow multiple selections"
                sx={{ mt: 1 }}
              />
              <TextField
                fullWidth
                label="Default Value"
                value={editingComponent?.config?.default_value || ""}
                onChange={(e) =>
                  handleComponentFieldChange("default_value", e.target.value)
                }
                margin="normal"
                helperText="Default selected value (or use {{context.user.…}} to populate from profile)"
              />
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Options
              </Typography>
              {(editingComponent?.config?.options || []).map(
                (option: { label: string; value: string }, index: number) => (
                  <Box
                    key={index}
                    sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}
                  >
                    <TextField
                      size="small"
                      label="Label"
                      value={option.label}
                      onChange={(e) => {
                        const newOptions = [
                          ...(editingComponent?.config?.options || []),
                        ];
                        newOptions[index] = {
                          label: e.target.value,
                          value: newOptions[index]?.value || "",
                        };
                        handleComponentFieldChange("options", newOptions);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={option.value}
                      onChange={(e) => {
                        const newOptions = [
                          ...(editingComponent?.config?.options || []),
                        ];
                        newOptions[index] = {
                          label: newOptions[index]?.label || "",
                          value: e.target.value,
                        };
                        handleComponentFieldChange("options", newOptions);
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => {
                        const newOptions = (
                          editingComponent?.config?.options || []
                        ).filter((_: any, i: number) => i !== index);
                        handleComponentFieldChange("options", newOptions);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ),
              )}
              <Button
                size="small"
                onClick={() => {
                  const newOptions = [
                    ...(editingComponent?.config?.options || []),
                    { label: "", value: "" },
                  ];
                  handleComponentFieldChange("options", newOptions);
                }}
                startIcon={<AddCircleOutlineIcon />}
              >
                Add Option
              </Button>
            </Box>
          )}
          {editingComponent?.type === "DATE" && (
            <Box>
              <TextField
                fullWidth
                label="Label"
                value={editingComponent?.label || ""}
                onChange={(e) => {
                  setEditingComponent((prev: any) => ({
                    ...prev,
                    label: e.target.value,
                  }));
                }}
                margin="normal"
                helperText="Label displayed above the date field"
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Format</InputLabel>
                <Select
                  value={editingComponent?.config?.format || "DATE"}
                  onChange={(e) =>
                    handleComponentFieldChange("format", e.target.value)
                  }
                  label="Format"
                >
                  <MenuItem value="DATE">Date</MenuItem>
                  <MenuItem value="TIME">Time</MenuItem>
                  <MenuItem value="DATETIME">Date & Time</MenuItem>
                </Select>
                <FormHelperText>Select the date/time format</FormHelperText>
              </FormControl>
              <Autocomplete
                freeSolo
                options={ROUTER_FIELD_OPTIONS}
                getOptionLabel={(option) =>
                  typeof option === "string" ? option : option.label
                }
                value={
                  ROUTER_FIELD_OPTIONS.find(
                    (opt) =>
                      opt.value === editingComponent?.config?.default_value,
                  ) || (editingComponent?.config?.default_value as string) || ""
                }
                onChange={(_e, newValue) => {
                  const val =
                    newValue === null
                      ? ""
                      : typeof newValue === "string"
                        ? newValue
                        : newValue.value;
                  handleComponentFieldChange("default_value", val);
                }}
                onInputChange={(_e, newInput, reason) => {
                  if (reason === "input") {
                    handleComponentFieldChange("default_value", newInput);
                  }
                }}
                renderOption={(props, option) => (
                  <li {...props} key={typeof option === "string" ? option : option.value}>
                    <Box>
                      <Typography variant="body2">
                        {typeof option === "string" ? option : option.label}
                      </Typography>
                      {typeof option !== "string" && option.description && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                        >
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    label="Default Value"
                    margin="normal"
                    helperText="Pre-fill from user profile, e.g. {{context.user.user_metadata.birthdate}}"
                  />
                )}
              />
            </Box>
          )}
          {editingComponent?.type === "CHOICE" && (
            <Box>
              <TextField
                fullWidth
                label="Label"
                value={editingComponent?.label || ""}
                onChange={(e) => {
                  setEditingComponent((prev: any) => ({
                    ...prev,
                    label: e.target.value,
                  }));
                }}
                margin="normal"
                helperText="Label displayed above the choice field"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editingComponent?.config?.multiple || false}
                    onChange={(e) =>
                      handleComponentFieldChange("multiple", e.target.checked)
                    }
                  />
                }
                label="Allow multiple selections"
                sx={{ mt: 1 }}
              />
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Options
              </Typography>
              {(editingComponent?.config?.options || []).map(
                (option: { label: string; value: string }, index: number) => (
                  <Box
                    key={index}
                    sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}
                  >
                    <TextField
                      size="small"
                      label="Label"
                      value={option.label}
                      onChange={(e) => {
                        const newOptions = [
                          ...(editingComponent?.config?.options || []),
                        ];
                        newOptions[index] = {
                          label: e.target.value,
                          value: newOptions[index]?.value || "",
                        };
                        handleComponentFieldChange("options", newOptions);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={option.value}
                      onChange={(e) => {
                        const newOptions = [
                          ...(editingComponent?.config?.options || []),
                        ];
                        newOptions[index] = {
                          label: newOptions[index]?.label || "",
                          value: e.target.value,
                        };
                        handleComponentFieldChange("options", newOptions);
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => {
                        const newOptions = (
                          editingComponent?.config?.options || []
                        ).filter((_: any, i: number) => i !== index);
                        handleComponentFieldChange("options", newOptions);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ),
              )}
              <Button
                size="small"
                onClick={() => {
                  const newOptions = [
                    ...(editingComponent?.config?.options || []),
                    { label: "", value: "" },
                  ];
                  handleComponentFieldChange("options", newOptions);
                }}
                startIcon={<AddCircleOutlineIcon />}
              >
                Add Option
              </Button>
            </Box>
          )}
          {editingComponent?.type === "CUSTOM" && (
            <Box>
              <TextField
                fullWidth
                label="Label"
                value={editingComponent?.label || ""}
                onChange={(e) => {
                  setEditingComponent((prev: any) => ({
                    ...prev,
                    label: e.target.value,
                  }));
                }}
                margin="normal"
                helperText="Label displayed above the custom field"
              />
              <TextField
                fullWidth
                label="Custom Code"
                value={editingComponent?.config?.code || ""}
                onChange={(e) =>
                  handleComponentFieldChange("code", e.target.value)
                }
                margin="normal"
                multiline
                rows={10}
                helperText="JavaScript code for the custom field component"
                sx={{
                  "& .MuiInputBase-input": {
                    fontFamily: "monospace",
                    fontSize: "12px",
                  },
                }}
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
