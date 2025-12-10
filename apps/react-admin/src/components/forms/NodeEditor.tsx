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
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CodeIcon from "@mui/icons-material/Code";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DragHandleIcon from "@mui/icons-material/DragHandle";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { Node } from "@xyflow/react";

// DnD Kit imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type {
  ComponentConfig,
  FlowNodeData,
  StartNode,
  EndingNode,
  RouterRule,
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

// Rich Text Editor Component with HTML preview
interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange }) => {
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  return (
    <Box sx={{ mt: 2 }}>
      {/* View mode toggle */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, newMode) => newMode && setViewMode(newMode)}
          size="small"
        >
          <ToggleButton value="edit" aria-label="edit mode">
            <CodeIcon fontSize="small" sx={{ mr: 0.5 }} />
            Edit
          </ToggleButton>
          <ToggleButton value="preview" aria-label="preview mode">
            <VisibilityIcon fontSize="small" sx={{ mr: 0.5 }} />
            Preview
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {viewMode === "edit" ? (
        <TextField
          fullWidth
          multiline
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="<p>Enter HTML content here...</p>"
          sx={{
            "& .MuiInputBase-input": {
              fontFamily: "monospace",
              fontSize: "0.875rem",
            },
          }}
        />
      ) : (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            minHeight: 150,
            "& p": { margin: "0 0 0.5em 0" },
            "& ul, & ol": { paddingLeft: "1.5em", margin: "0.5em 0" },
            "& a": { color: "#1976d2", textDecoration: "underline" },
            "& u": { textDecoration: "underline" },
          }}
        >
          {value ? (
            <div dangerouslySetInnerHTML={{ __html: value }} />
          ) : (
            <Typography color="text.secondary" fontStyle="italic">
              No content to preview
            </Typography>
          )}
        </Paper>
      )}
      <FormHelperText>
        Enter HTML content. Use {"{{context.user.email}}"} for dynamic values.
        Toggle to preview the rendered output.
      </FormHelperText>
    </Box>
  );
};

// Sortable Component Item for drag-and-drop
interface SortableComponentItemProps {
  component: ComponentConfig;
  onEdit: (component: ComponentConfig) => void;
  onDelete: (componentId: string) => void;
}

const SortableComponentItem: React.FC<SortableComponentItemProps> = ({
  component,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: component.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      sx={{
        p: 2,
        mb: 1,
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        sx={{
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          color: "text.secondary",
          "&:hover": { color: "text.primary" },
        }}
      >
        <DragHandleIcon />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="subtitle2">{component.type}</Typography>
        <Typography variant="caption" color="text.secondary">
          {component.type === "RICH_TEXT" && component.config?.content
            ? `Content: ${component.config.content.replace(/<[^>]*>/g, "").substring(0, 30)}...`
            : component.type === "DIVIDER"
              ? "Horizontal line"
              : component.type === "LEGAL" && component.config?.text
                ? `Text: ${component.config.text}`
                : component.type === "NEXT_BUTTON" && component.config?.text
                  ? `Button: ${component.config.text}`
                  : component.label
                    ? `${component.label}${component.required ? " *" : ""}`
                    : component.id}
        </Typography>
      </Box>
      <Box>
        <IconButton
          size="small"
          aria-label="edit component"
          onClick={() => onEdit(component)}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          aria-label="delete component"
          onClick={() => onDelete(component.id)}
          color="error"
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </Paper>
  );
};

// Component types available for adding
const COMPONENT_TYPES = [
  { value: "RICH_TEXT", label: "Rich Text", category: "BLOCK" },
  { value: "DIVIDER", label: "Divider", category: "BLOCK" },
  { value: "TEXT", label: "Text Input", category: "FIELD" },
  { value: "NUMBER", label: "Number Input", category: "FIELD" },
  { value: "EMAIL", label: "Email Input", category: "FIELD" },
  { value: "PHONE", label: "Phone Input", category: "FIELD" },
  { value: "DATETIME", label: "Date/Time Input", category: "FIELD" },
  { value: "BOOLEAN", label: "Checkbox", category: "FIELD" },
  { value: "LEGAL", label: "Legal Checkbox", category: "FIELD" },
  { value: "NEXT_BUTTON", label: "Next Button", category: "BLOCK" },
] as const;

// Component Editor Dialog
interface ComponentEditorDialogProps {
  open: boolean;
  component: ComponentConfig | null;
  mode: "add" | "edit";
  onClose: () => void;
  onSave: (component: ComponentConfig) => void;
}

const ComponentEditorDialog: React.FC<ComponentEditorDialogProps> = ({
  open,
  component,
  mode,
  onClose,
  onSave,
}) => {
  const [componentType, setComponentType] = useState<ComponentConfig["type"]>(
    component?.type || "RICH_TEXT",
  );
  const [content, setContent] = useState(component?.config?.content || "");
  const [text, setText] = useState(
    component?.config?.text || component?.config?.content || "",
  );
  const [label, setLabel] = useState(component?.label || "");
  const [placeholder, setPlaceholder] = useState(
    component?.config?.placeholder || "",
  );
  const [required, setRequired] = useState(component?.required || false);
  const [sensitive, setSensitive] = useState(component?.sensitive || false);
  const [multiline, setMultiline] = useState(
    component?.config?.multiline || false,
  );
  const [min, setMin] = useState<number | undefined>(component?.config?.min);
  const [max, setMax] = useState<number | undefined>(component?.config?.max);

  // Reset form when dialog opens with new component
  useEffect(() => {
    if (open) {
      setComponentType(component?.type || "RICH_TEXT");
      setContent(component?.config?.content || "");
      setText(component?.config?.text || component?.config?.content || "");
      setLabel(component?.label || "");
      setPlaceholder(component?.config?.placeholder || "");
      setRequired(component?.required || false);
      setSensitive(component?.sensitive || false);
      setMultiline(component?.config?.multiline || false);
      setMin(component?.config?.min);
      setMax(component?.config?.max);
    }
  }, [open, component]);

  const handleSave = () => {
    const randomId = () => Math.random().toString(36).slice(2, 6);
    // Get type prefix for ID (e.g., "RICH_TEXT" -> "rich_text")
    const typePrefix = componentType.toLowerCase();
    // Find category for this component type
    const componentTypeInfo = COMPONENT_TYPES.find(
      (t) => t.value === componentType,
    );
    const category = componentTypeInfo?.category as "BLOCK" | "FIELD";

    const newComponent: ComponentConfig = {
      id: component?.id || `${typePrefix}_${randomId()}`,
      type: componentType,
      category,
    };

    switch (componentType) {
      case "RICH_TEXT":
        newComponent.config = { content: content };
        break;
      case "DIVIDER":
        // Divider has no config
        break;
      case "LEGAL":
        newComponent.config = { text: text };
        newComponent.required = required;
        break;
      case "NEXT_BUTTON":
        newComponent.config = { text: text || "Continue" };
        break;
      case "TEXT":
        newComponent.label = label;
        newComponent.required = required;
        newComponent.sensitive = sensitive;
        newComponent.config = {
          multiline,
          placeholder: placeholder || undefined,
        };
        break;
      case "NUMBER":
        newComponent.label = label;
        newComponent.required = required;
        newComponent.sensitive = sensitive;
        newComponent.config = {
          placeholder: placeholder || undefined,
          min,
          max,
        };
        break;
      case "EMAIL":
        newComponent.label = label;
        newComponent.required = required;
        newComponent.sensitive = sensitive;
        newComponent.config = { placeholder: placeholder || undefined };
        break;
      case "PHONE":
        newComponent.label = label;
        newComponent.required = required;
        newComponent.sensitive = sensitive;
        newComponent.config = { placeholder: placeholder || undefined };
        break;
      case "DATETIME":
        newComponent.label = label;
        newComponent.required = required;
        newComponent.sensitive = sensitive;
        newComponent.config = { placeholder: placeholder || undefined };
        break;
      case "BOOLEAN":
        newComponent.label = label;
        newComponent.required = required;
        newComponent.sensitive = sensitive;
        newComponent.config = { text: text || undefined };
        break;
    }

    // Clean up empty config
    if (newComponent.config && Object.keys(newComponent.config).length === 0) {
      delete newComponent.config;
    }

    onSave(newComponent);
    onClose();
  };

  const renderComponentFields = () => {
    // Common input field settings used by multiple input types
    const renderInputFields = (showMultiline = false, showMinMax = false) => (
      <>
        <TextField
          fullWidth
          label="Field Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          margin="normal"
          helperText="Label displayed above the input"
        />
        <TextField
          fullWidth
          label="Placeholder"
          value={placeholder}
          onChange={(e) => setPlaceholder(e.target.value)}
          margin="normal"
          helperText="Placeholder text shown when empty"
        />
        {showMultiline && (
          <FormControlLabel
            control={
              <Switch
                checked={multiline}
                onChange={(e) => setMultiline(e.target.checked)}
              />
            }
            label="Multiline input"
            sx={{ mt: 1 }}
          />
        )}
        {showMinMax && (
          <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
            <TextField
              label="Min Value"
              type="number"
              value={min ?? ""}
              onChange={(e) =>
                setMin(e.target.value ? Number(e.target.value) : undefined)
              }
              sx={{ flex: 1 }}
            />
            <TextField
              label="Max Value"
              type="number"
              value={max ?? ""}
              onChange={(e) =>
                setMax(e.target.value ? Number(e.target.value) : undefined)
              }
              sx={{ flex: 1 }}
            />
          </Box>
        )}
        <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
            }
            label="Required"
          />
          <FormControlLabel
            control={
              <Switch
                checked={sensitive}
                onChange={(e) => setSensitive(e.target.checked)}
              />
            }
            label="Sensitive"
          />
        </Box>
      </>
    );

    switch (componentType) {
      case "RICH_TEXT":
        return <RichTextEditor value={content} onChange={setContent} />;
      case "DIVIDER":
        return (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            A horizontal divider line will be displayed.
          </Typography>
        );
      case "LEGAL":
        return (
          <>
            <TextField
              fullWidth
              label="Legal Text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              margin="normal"
              multiline
              rows={2}
              helperText="Text for the legal checkbox (HTML supported)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                />
              }
              label="Required field"
              sx={{ mt: 1 }}
            />
          </>
        );
      case "NEXT_BUTTON":
        return (
          <TextField
            fullWidth
            label="Button Text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            margin="normal"
            helperText="Text displayed on the button"
          />
        );
      case "TEXT":
        return renderInputFields(true, false);
      case "NUMBER":
        return renderInputFields(false, true);
      case "EMAIL":
        return renderInputFields(false, false);
      case "PHONE":
        return renderInputFields(false, false);
      case "DATETIME":
        return renderInputFields(false, false);
      case "BOOLEAN":
        return (
          <>
            <TextField
              fullWidth
              label="Field Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              margin="normal"
              helperText="Label for the checkbox"
            />
            <TextField
              fullWidth
              label="Description Text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              margin="normal"
              helperText="Optional description next to checkbox"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                />
              }
              label="Required field"
              sx={{ mt: 1 }}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mode === "add" ? "Add Component" : "Edit Component"}
      </DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel id="component-type-label">Component Type</InputLabel>
          <Select
            labelId="component-type-label"
            value={componentType}
            label="Component Type"
            onChange={(e) =>
              setComponentType(e.target.value as ComponentConfig["type"])
            }
            disabled={mode === "edit"}
          >
            {COMPONENT_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {renderComponentFields()}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {mode === "add" ? "Add" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Sortable Rule Item Component for router rules
interface SortableRuleItemProps {
  rule: RouterRule;
  nodes: FlowNodeData[];
  onEdit: (rule: RouterRule) => void;
  onDelete: (ruleId: string) => void;
}

const SortableRuleItem: React.FC<SortableRuleItemProps> = ({
  rule,
  nodes,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getTargetLabel = (next_node: string) => {
    if (next_node === "$ending") return "End Flow";
    const node = nodes.find((n) => n.id === next_node);
    return node?.alias || next_node;
  };

  // Summarize the condition for display
  const summarizeCondition = (condition: any): string => {
    if (!condition) return "No condition";
    if (condition.operator === "AND" || condition.operator === "OR") {
      const count = condition.operands?.length || 0;
      return `${condition.operator} (${count} condition${count !== 1 ? "s" : ""})`;
    }
    if (condition.operator) {
      const operands = condition.operands || [];
      return `${operands[0] || "?"} ${condition.operator}${operands[1] ? " " + operands[1] : ""}`;
    }
    return "Complex condition";
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      sx={{
        p: 1.5,
        mb: 1,
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: isDragging ? "grabbing" : "default",
        backgroundColor: isDragging ? "action.hover" : "background.paper",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        sx={{
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          color: "text.secondary",
        }}
      >
        <DragHandleIcon fontSize="small" />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" noWrap>
          {rule.alias || rule.id}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {summarizeCondition(rule.condition)} →{" "}
          {getTargetLabel(rule.next_node)}
        </Typography>
      </Box>
      <IconButton size="small" onClick={() => onEdit(rule)} title="Edit rule">
        <EditIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => onDelete(rule.id)}
        color="error"
        title="Delete rule"
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
};

// Rule Editor Dialog Component
interface RuleEditorDialogProps {
  open: boolean;
  rule: RouterRule | null;
  mode: "add" | "edit";
  nodes: FlowNodeData[];
  currentNodeId: string;
  onClose: () => void;
  onSave: (rule: RouterRule) => void;
}

const OPERATORS = [
  { value: "EQUALS", label: "Equals" },
  { value: "NOT_EQUALS", label: "Not Equals" },
  { value: "CONTAINS", label: "Contains" },
  { value: "NOT_CONTAINS", label: "Not Contains" },
  { value: "STARTS_WITH", label: "Starts With" },
  { value: "ENDS_WITH", label: "Ends With" },
  { value: "HAS_VALUE", label: "Has Value" },
  { value: "IS_EMPTY", label: "Is Empty" },
  { value: "GREATER_THAN", label: "Greater Than" },
  { value: "LESS_THAN", label: "Less Than" },
];

const RuleEditorDialog: React.FC<RuleEditorDialogProps> = ({
  open,
  rule,
  mode,
  nodes,
  currentNodeId,
  onClose,
  onSave,
}) => {
  const [alias, setAlias] = useState("");
  const [nextNode, setNextNode] = useState("");
  const [conditionOperator, setConditionOperator] = useState<"AND" | "OR">(
    "AND",
  );
  const [conditions, setConditions] = useState<
    Array<{
      operator: string;
      field: string;
      value: string;
    }>
  >([]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonCondition, setJsonCondition] = useState("");

  // Initialize form when rule changes
  useEffect(() => {
    if (rule) {
      setAlias(rule.alias || "");
      setNextNode(rule.next_node || "");
      setJsonCondition(JSON.stringify(rule.condition, null, 2));

      // Parse condition for simple editor
      if (
        rule.condition?.operator === "AND" ||
        rule.condition?.operator === "OR"
      ) {
        setConditionOperator(rule.condition.operator);
        const parsed = (rule.condition.operands || []).map((op: any) => ({
          operator: op.operator || "EQUALS",
          field: op.operands?.[0] || "",
          value: op.operands?.[1] || "",
        }));
        setConditions(
          parsed.length > 0
            ? parsed
            : [{ operator: "EQUALS", field: "", value: "" }],
        );
      } else if (rule.condition?.operator) {
        setConditionOperator("AND");
        setConditions([
          {
            operator: rule.condition.operator,
            field: rule.condition.operands?.[0] || "",
            value: rule.condition.operands?.[1] || "",
          },
        ]);
      } else {
        setConditions([{ operator: "EQUALS", field: "", value: "" }]);
      }
    } else {
      setAlias("");
      setNextNode("");
      setConditionOperator("AND");
      setConditions([{ operator: "EQUALS", field: "", value: "" }]);
      setJsonCondition(
        JSON.stringify(
          {
            operator: "AND",
            operands: [{ operator: "EQUALS", operands: ["", ""] }],
          },
          null,
          2,
        ),
      );
    }
  }, [rule, open]);

  const handleAddCondition = () => {
    setConditions([
      ...conditions,
      { operator: "EQUALS", field: "", value: "" },
    ]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (
    index: number,
    field: string,
    value: string,
  ) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  const handleSave = () => {
    let condition: any;

    if (jsonMode) {
      try {
        condition = JSON.parse(jsonCondition);
      } catch (e) {
        alert("Invalid JSON condition");
        return;
      }
    } else {
      // Build condition from simple editor
      const operands = conditions.map((c) => {
        if (c.operator === "HAS_VALUE" || c.operator === "IS_EMPTY") {
          return { operator: c.operator, operands: [c.field] };
        }
        return { operator: c.operator, operands: [c.field, c.value] };
      });
      condition = {
        operator: conditionOperator,
        operands,
      };
    }

    const savedRule: RouterRule = {
      id: rule?.id || `id_${Date.now()}`,
      alias: alias || undefined,
      condition,
      next_node: nextNode,
    };

    onSave(savedRule);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{mode === "add" ? "Add Rule" : "Edit Rule"}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Rule Name (Alias)"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          margin="normal"
          helperText="A friendly name for this rule"
        />

        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel id="next-node-label">Target Node</InputLabel>
          <Select
            labelId="next-node-label"
            value={nextNode}
            label="Target Node"
            onChange={(e) => setNextNode(e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {nodes
              .filter((node) => node.id !== currentNodeId)
              .map((node) => (
                <MenuItem key={node.id} value={node.id}>
                  {node.alias || node.id}
                </MenuItem>
              ))}
            <MenuItem value="$ending">End Flow</MenuItem>
          </Select>
          <FormHelperText>Where to go if this rule matches</FormHelperText>
        </FormControl>

        <Divider sx={{ my: 3 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h6">Condition</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={jsonMode}
                onChange={(e) => setJsonMode(e.target.checked)}
                size="small"
              />
            }
            label="JSON Mode"
          />
        </Box>

        {jsonMode ? (
          <TextField
            fullWidth
            multiline
            rows={8}
            value={jsonCondition}
            onChange={(e) => setJsonCondition(e.target.value)}
            label="Condition JSON"
            sx={{ fontFamily: "monospace" }}
          />
        ) : (
          <Box>
            <FormControl sx={{ mb: 2, minWidth: 120 }}>
              <InputLabel>Logic</InputLabel>
              <Select
                value={conditionOperator}
                label="Logic"
                onChange={(e) =>
                  setConditionOperator(e.target.value as "AND" | "OR")
                }
                size="small"
              >
                <MenuItem value="AND">AND (all must match)</MenuItem>
                <MenuItem value="OR">OR (any must match)</MenuItem>
              </Select>
            </FormControl>

            {conditions.map((condition, index) => (
              <Paper
                key={index}
                sx={{ p: 2, mb: 1, bgcolor: "background.default" }}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <TextField
                    label="Field"
                    value={condition.field}
                    onChange={(e) =>
                      handleConditionChange(index, "field", e.target.value)
                    }
                    size="small"
                    sx={{ flex: 1, minWidth: 150 }}
                    placeholder="e.g., user_id, email"
                  />
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Operator</InputLabel>
                    <Select
                      value={condition.operator}
                      label="Operator"
                      onChange={(e) =>
                        handleConditionChange(index, "operator", e.target.value)
                      }
                    >
                      {OPERATORS.map((op) => (
                        <MenuItem key={op.value} value={op.value}>
                          {op.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {condition.operator !== "HAS_VALUE" &&
                    condition.operator !== "IS_EMPTY" && (
                      <TextField
                        label="Value"
                        value={condition.value}
                        onChange={(e) =>
                          handleConditionChange(index, "value", e.target.value)
                        }
                        size="small"
                        sx={{ flex: 1, minWidth: 150 }}
                      />
                    )}
                  {conditions.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveCondition(index)}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Paper>
            ))}

            <Button
              variant="text"
              startIcon={<AddCircleOutlineIcon />}
              onClick={handleAddCondition}
              sx={{ mt: 1 }}
            >
              Add Condition
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {mode === "add" ? "Add" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
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

  // Component editor dialog state
  const [componentDialogOpen, setComponentDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] =
    useState<ComponentConfig | null>(null);
  const [componentDialogMode, setComponentDialogMode] = useState<
    "add" | "edit"
  >("add");

  // Rule editor dialog state (for routers)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RouterRule | null>(null);
  const [ruleDialogMode, setRuleDialogMode] = useState<"add" | "edit">("add");

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
          // Router-specific data
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

  // Component handlers
  const handleAddComponent = useCallback(() => {
    setEditingComponent(null);
    setComponentDialogMode("add");
    setComponentDialogOpen(true);
  }, []);

  const handleEditComponent = useCallback((component: ComponentConfig) => {
    setEditingComponent(component);
    setComponentDialogMode("edit");
    setComponentDialogOpen(true);
  }, []);

  const handleDeleteComponent = useCallback((componentId: string) => {
    setFormData((prev: any) => ({
      ...prev,
      components: prev.components.filter(
        (c: ComponentConfig) => c.id !== componentId,
      ),
    }));
  }, []);

  const handleComponentSave = useCallback((component: ComponentConfig) => {
    setFormData((prev: any) => {
      const existingComponents = prev.components || [];
      const existingIndex = existingComponents.findIndex(
        (c: ComponentConfig) => c.id === component.id,
      );

      if (existingIndex >= 0) {
        // Update existing component
        const updatedComponents = [...existingComponents];
        updatedComponents[existingIndex] = component;
        return { ...prev, components: updatedComponents };
      } else {
        // Add new component
        return { ...prev, components: [...existingComponents, component] };
      }
    });
  }, []);

  const handleCloseComponentDialog = useCallback(() => {
    setComponentDialogOpen(false);
    setEditingComponent(null);
  }, []);

  // Rule handlers (for routers)
  const handleAddRule = useCallback(() => {
    setEditingRule(null);
    setRuleDialogMode("add");
    setRuleDialogOpen(true);
  }, []);

  const handleEditRule = useCallback((rule: RouterRule) => {
    setEditingRule(rule);
    setRuleDialogMode("edit");
    setRuleDialogOpen(true);
  }, []);

  const handleDeleteRule = useCallback((ruleId: string) => {
    setFormData((prev: any) => ({
      ...prev,
      rules: prev.rules.filter((r: RouterRule) => r.id !== ruleId),
    }));
  }, []);

  const handleRuleSave = useCallback((rule: RouterRule) => {
    setFormData((prev: any) => {
      const existingRules = prev.rules || [];
      const existingIndex = existingRules.findIndex(
        (r: RouterRule) => r.id === rule.id,
      );

      if (existingIndex >= 0) {
        // Update existing rule
        const updatedRules = [...existingRules];
        updatedRules[existingIndex] = rule;
        return { ...prev, rules: updatedRules };
      } else {
        // Add new rule
        return { ...prev, rules: [...existingRules, rule] };
      }
    });
  }, []);

  const handleCloseRuleDialog = useCallback(() => {
    setRuleDialogOpen(false);
    setEditingRule(null);
  }, []);

  // Handle drag end for reordering rules
  const handleRuleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFormData((prev: any) => {
        const rules = prev.rules || [];
        const oldIndex = rules.findIndex((r: RouterRule) => r.id === active.id);
        const newIndex = rules.findIndex((r: RouterRule) => r.id === over.id);

        return {
          ...prev,
          rules: arrayMove(rules, oldIndex, newIndex),
        };
      });
    }
  }, []);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Handle drag end for reordering components
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFormData((prev: any) => {
        const components = prev.components || [];
        const oldIndex = components.findIndex(
          (c: ComponentConfig) => c.id === active.id,
        );
        const newIndex = components.findIndex(
          (c: ComponentConfig) => c.id === over.id,
        );

        return {
          ...prev,
          components: arrayMove(components, oldIndex, newIndex),
        };
      });
    }
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
        updates.config = {
          rules: formData.rules || [],
          fallback: formData.fallback || "$ending",
        };
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
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 2 }}
      >
        Drag components to reorder them
      </Typography>

      {formData.components && formData.components.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={formData.components.map((c: ComponentConfig) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <Box sx={{ mt: 2 }}>
              {formData.components.map((component: ComponentConfig) => (
                <SortableComponentItem
                  key={component.id}
                  component={component}
                  onEdit={handleEditComponent}
                  onDelete={handleDeleteComponent}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
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
        onClick={handleAddComponent}
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
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 2 }}
      >
        Rules are evaluated in order. Drag to reorder.
      </Typography>

      {formData.rules && formData.rules.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleRuleDragEnd}
        >
          <SortableContext
            items={formData.rules.map((r: RouterRule) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <Box sx={{ mt: 2 }}>
              {formData.rules.map((rule: RouterRule) => (
                <SortableRuleItem
                  key={rule.id}
                  rule={rule}
                  nodes={nodes}
                  onEdit={handleEditRule}
                  onDelete={handleDeleteRule}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No rules added to this router.
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

      <Typography variant="h6" gutterBottom>
        Default (Fallback)
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 2 }}
      >
        Where to go if no rules match
      </Typography>

      <FormControl fullWidth>
        <InputLabel id="fallback-label">Fallback Target</InputLabel>
        <Select
          labelId="fallback-label"
          id="fallback"
          name="fallback"
          value={formData.fallback || "$ending"}
          label="Fallback Target"
          onChange={handleInputChange}
        >
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

      {/* Component Editor Dialog */}
      <ComponentEditorDialog
        open={componentDialogOpen}
        component={editingComponent}
        mode={componentDialogMode}
        onClose={handleCloseComponentDialog}
        onSave={handleComponentSave}
      />

      {/* Rule Editor Dialog (for routers) */}
      <RuleEditorDialog
        open={ruleDialogOpen}
        rule={editingRule}
        mode={ruleDialogMode}
        nodes={nodes}
        currentNodeId={selectedNode?.id || ""}
        onClose={handleCloseRuleDialog}
        onSave={handleRuleSave}
      />
    </Drawer>
  );
};

export default NodeEditor;
