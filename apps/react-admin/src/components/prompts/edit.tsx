import {
  Edit,
  TabbedForm,
  SelectInput,
  useRecordContext,
  useDataProvider,
  useNotify,
  useRefresh,
  useInput,
} from "react-admin";
import {
  Stack,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useState, useCallback } from "react";

// Available prompt screens
const PROMPT_SCREENS = [
  { id: "login", name: "Login" },
  { id: "login-id", name: "Login - Identifier" },
  { id: "login-password", name: "Login - Password" },
  { id: "signup", name: "Sign Up" },
  { id: "signup-id", name: "Sign Up - Identifier" },
  { id: "signup-password", name: "Sign Up - Password" },
  { id: "reset-password", name: "Reset Password" },
  { id: "consent", name: "Consent" },
  { id: "mfa", name: "MFA" },
  { id: "mfa-push", name: "MFA - Push" },
  { id: "mfa-otp", name: "MFA - OTP" },
  { id: "mfa-voice", name: "MFA - Voice" },
  { id: "mfa-phone", name: "MFA - Phone" },
  { id: "mfa-webauthn", name: "MFA - WebAuthn" },
  { id: "mfa-sms", name: "MFA - SMS" },
  { id: "mfa-email", name: "MFA - Email" },
  { id: "mfa-recovery-code", name: "MFA - Recovery Code" },
  { id: "status", name: "Status" },
  { id: "device-flow", name: "Device Flow" },
  { id: "email-verification", name: "Email Verification" },
  { id: "email-otp-challenge", name: "Email OTP Challenge" },
  { id: "organizations", name: "Organizations" },
  { id: "invitation", name: "Invitation" },
  { id: "common", name: "Common" },
];

// Common languages
const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "es", name: "Spanish" },
  { id: "fr", name: "French" },
  { id: "de", name: "German" },
  { id: "it", name: "Italian" },
  { id: "pt", name: "Portuguese" },
  { id: "nl", name: "Dutch" },
  { id: "ja", name: "Japanese" },
  { id: "ko", name: "Korean" },
  { id: "zh", name: "Chinese" },
  { id: "sv", name: "Swedish" },
  { id: "nb", name: "Norwegian" },
  { id: "fi", name: "Finnish" },
  { id: "da", name: "Danish" },
  { id: "pl", name: "Polish" },
  { id: "cs", name: "Czech" },
];

// Login flow options
const LOGIN_FLOW_OPTIONS = [
  {
    value: "identifier-password",
    label: "Identifier + Password",
    description:
      "A single login screen prompts users for their user identifier and their password.",
  },
  {
    value: "identifier-first",
    label: "Identifier First",
    description:
      "An initial login screen prompts users for their user identifier, then a different screen prompts users for their password.",
    isDefault: true,
  },
  {
    value: "identifier-first-biometrics",
    label: "Identifier First + Biometrics",
    description:
      "When possible, users will be able to choose to sign-in using face or fingerprint recognition instead of a password.",
    enterprise: true,
  },
];

// Custom input for login flow selection
function LoginFlowInput() {
  const identifierFirstInput = useInput({ source: "identifier_first" });
  const webauthnInput = useInput({ source: "webauthn_platform_first_factor" });

  // Determine current value based on the underlying fields
  // Default to "identifier-first" when no explicit value is set
  const getCurrentValue = () => {
    const identifierFirst = identifierFirstInput.field.value;
    const webauthn = webauthnInput.field.value;

    if (webauthn && identifierFirst) {
      return "identifier-first-biometrics";
    }
    // Default to identifier-first when not explicitly set to false
    if (identifierFirst !== false) {
      return "identifier-first";
    }
    return "identifier-password";
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    switch (value) {
      case "identifier-password":
        identifierFirstInput.field.onChange(false);
        webauthnInput.field.onChange(false);
        break;
      case "identifier-first":
        identifierFirstInput.field.onChange(true);
        webauthnInput.field.onChange(false);
        break;
      case "identifier-first-biometrics":
        identifierFirstInput.field.onChange(true);
        webauthnInput.field.onChange(true);
        break;
    }
  };

  return (
    <FormControl component="fieldset" sx={{ width: "100%" }}>
      <FormLabel component="legend" sx={{ mb: 2 }}>
        Login Flow
      </FormLabel>
      <RadioGroup value={getCurrentValue()} onChange={handleChange}>
        {LOGIN_FLOW_OPTIONS.map((option) => (
          <Box
            key={option.value}
            sx={{
              mb: 2,
              p: 2,
              border: 1,
              borderColor:
                getCurrentValue() === option.value ? "primary.main" : "divider",
              borderRadius: 1,
              backgroundColor:
                getCurrentValue() === option.value
                  ? "action.selected"
                  : "transparent",
            }}
          >
            <FormControlLabel
              value={option.value}
              control={<Radio />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="subtitle1" fontWeight="medium">
                    {option.label}
                  </Typography>
                  {option.isDefault && (
                    <Chip label="default" size="small" variant="outlined" />
                  )}
                  {option.enterprise && (
                    <Chip
                      label="enterprise"
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </Box>
              }
              sx={{ mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ ml: 4, mt: -0.5 }}
            >
              {option.description}
            </Typography>
          </Box>
        ))}
      </RadioGroup>
    </FormControl>
  );
}

// Remove null/undefined values from an object
function removeNullValues(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      const cleaned = removeNullValues(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

interface CustomTextEntry {
  prompt: string;
  language: string;
}

function CustomTextTab() {
  const record = useRecordContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CustomTextEntry | null>(
    null,
  );
  const [editingTexts, setEditingTexts] = useState<
    Record<string, Record<string, string>>
  >({});
  const [newPrompt, setNewPrompt] = useState("");
  const [newLanguage, setNewLanguage] = useState("en");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const customTextEntries: CustomTextEntry[] = record?.customTextEntries || [];

  const handleAdd = useCallback(() => {
    setNewPrompt("");
    setNewLanguage("en");
    setDialogOpen(true);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newPrompt || !newLanguage) {
      notify("Please select a screen and language", { type: "warning" });
      return;
    }

    setLoading(true);
    try {
      await dataProvider.create("custom-text", {
        data: {
          prompt: newPrompt,
          language: newLanguage,
          texts: {},
        },
      });
      notify("Custom text created successfully", { type: "success" });
      setDialogOpen(false);
      refresh();
    } catch (error) {
      notify("Error creating custom text", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [dataProvider, newPrompt, newLanguage, notify, refresh]);

  const handleEdit = useCallback(
    async (entry: CustomTextEntry) => {
      setLoading(true);
      try {
        const result = await dataProvider.getOne("custom-text", {
          id: `${entry.prompt}:${entry.language}`,
        });
        setSelectedEntry(entry);
        const texts = result.data.texts || {};
        setEditingTexts(texts);
        setJsonValue(JSON.stringify(texts, null, 2));
        setJsonError(null);
        setViewMode("form");
        setEditDialogOpen(true);
      } catch (error) {
        notify("Error loading custom text", { type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [dataProvider, notify],
  );

  const handleSave = useCallback(async () => {
    if (!selectedEntry) return;

    // If in JSON mode, parse and validate JSON first
    let textsToSave = editingTexts;
    if (viewMode === "json") {
      try {
        textsToSave = JSON.parse(jsonValue);
        if (
          textsToSave === null ||
          typeof textsToSave !== "object" ||
          Array.isArray(textsToSave)
        ) {
          notify("JSON must be an object with nested screen objects", {
            type: "error",
          });
          return;
        }
        // Validate nested structure: { screenName: { key: string } }
        for (const [screenName, screenTexts] of Object.entries(textsToSave)) {
          if (
            screenTexts === null ||
            typeof screenTexts !== "object" ||
            Array.isArray(screenTexts)
          ) {
            notify(
              `Value for "${screenName}" must be an object with string values`,
              { type: "error" },
            );
            return;
          }
          const invalidKeys = Object.entries(
            screenTexts as Record<string, unknown>,
          )
            .filter(([, value]) => value !== null && typeof value !== "string")
            .map(([key]) => key);
          if (invalidKeys.length > 0) {
            notify(
              `Invalid values in "${screenName}" for keys: ${invalidKeys.join(", ")}. All values must be strings.`,
              { type: "error" },
            );
            return;
          }
        }
      } catch (e) {
        notify("Invalid JSON format", { type: "error" });
        return;
      }
    }

    // Filter out empty/null values before saving (per-screen)
    const filteredTexts: Record<string, Record<string, string>> = {};
    for (const [screen, screenTexts] of Object.entries(textsToSave)) {
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(screenTexts)) {
        if (value && typeof value === "string" && value.trim() !== "") {
          filtered[key] = value;
        }
      }
      if (Object.keys(filtered).length > 0) {
        filteredTexts[screen] = filtered;
      }
    }

    setLoading(true);
    try {
      await dataProvider.update("custom-text", {
        id: `${selectedEntry.prompt}:${selectedEntry.language}`,
        data: { texts: filteredTexts },
        previousData: {},
      });
      notify("Custom text updated successfully", { type: "success" });
      setEditDialogOpen(false);
      refresh();
    } catch (error) {
      notify("Error updating custom text", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [
    dataProvider,
    selectedEntry,
    editingTexts,
    jsonValue,
    viewMode,
    notify,
    refresh,
  ]);

  const handleDelete = useCallback(
    async (entry: CustomTextEntry) => {
      if (
        !window.confirm(
          `Delete custom text for ${entry.prompt} (${entry.language})?`,
        )
      ) {
        return;
      }

      setLoading(true);
      try {
        await dataProvider.delete("custom-text", {
          id: `${entry.prompt}:${entry.language}`,
        });
        notify("Custom text deleted successfully", { type: "success" });
        refresh();
      } catch (error) {
        notify("Error deleting custom text", { type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [dataProvider, notify, refresh],
  );

  const handleTextChange = useCallback(
    (screenName: string, key: string, value: string) => {
      setEditingTexts((prev) => {
        const newTexts = {
          ...prev,
          [screenName]: { ...prev[screenName], [key]: value },
        };
        setJsonValue(JSON.stringify(newTexts, null, 2));
        return newTexts;
      });
    },
    [],
  );

  const handleJsonChange = useCallback((value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        setJsonError("JSON must be an object with nested screen objects");
        return;
      }
      // Validate nested structure: { screenName: { key: string } }
      const result: Record<string, Record<string, string>> = {};
      for (const [screenName, screenTexts] of Object.entries(parsed)) {
        if (
          screenTexts === null ||
          typeof screenTexts !== "object" ||
          Array.isArray(screenTexts)
        ) {
          setJsonError(
            `Value for "${screenName}" must be an object with string values`,
          );
          return;
        }
        const hasInvalidValues = Object.values(
          screenTexts as Record<string, unknown>,
        ).some((v) => v !== null && typeof v !== "string");
        if (hasInvalidValues) {
          setJsonError(`All values in "${screenName}" must be strings`);
          return;
        }
        const screenResult: Record<string, string> = {};
        for (const [k, v] of Object.entries(
          screenTexts as Record<string, unknown>,
        )) {
          if (typeof v === "string") {
            screenResult[k] = v;
          }
        }
        result[screenName] = screenResult;
      }
      setEditingTexts(result);
      setJsonError(null);
    } catch (e) {
      setJsonError("Invalid JSON");
    }
  }, []);

  const handleViewModeChange = useCallback(
    (
      _event: React.MouseEvent<HTMLElement>,
      newMode: "form" | "json" | null,
    ) => {
      if (newMode !== null) {
        // Sync data between views
        if (newMode === "json") {
          setJsonValue(JSON.stringify(editingTexts, null, 2));
          setJsonError(null);
        } else if (newMode === "form" && !jsonError) {
          try {
            const parsed = JSON.parse(jsonValue);
            if (
              parsed !== null &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              // Convert nested structure to form state
              const result: Record<string, Record<string, string>> = {};
              for (const [screenName, screenTexts] of Object.entries(parsed)) {
                if (
                  screenTexts &&
                  typeof screenTexts === "object" &&
                  !Array.isArray(screenTexts)
                ) {
                  const screenResult: Record<string, string> = {};
                  for (const [k, v] of Object.entries(
                    screenTexts as Record<string, unknown>,
                  )) {
                    if (typeof v === "string") {
                      screenResult[k] = v;
                    }
                  }
                  result[screenName] = screenResult;
                }
              }
              setEditingTexts(result);
            }
          } catch (e) {
            // Keep existing form data if JSON is invalid
          }
        }
        setViewMode(newMode);
      }
    },
    [editingTexts, jsonValue, jsonError],
  );

  const handleAddTextKey = useCallback(
    (screenName: string) => {
      const key = window.prompt("Enter new text key:");
      if (key && !editingTexts[screenName]?.[key]) {
        setEditingTexts((prev) => ({
          ...prev,
          [screenName]: { ...prev[screenName], [key]: "" },
        }));
      }
    },
    [editingTexts],
  );

  const handleRemoveTextKey = useCallback((screenName: string, key: string) => {
    setEditingTexts((prev) => {
      const screenTexts = { ...prev[screenName] };
      delete screenTexts[key];
      return { ...prev, [screenName]: screenTexts };
    });
  }, []);

  const getScreenName = (prompt: string) => {
    return PROMPT_SCREENS.find((s) => s.id === prompt)?.name || prompt;
  };

  const getLanguageName = (lang: string) => {
    return LANGUAGES.find((l) => l.id === lang)?.name || lang;
  };

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6">Custom Text</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
          disabled={loading}
        >
          Add Custom Text
        </Button>
      </Box>

      <Typography variant="body2" color="textSecondary" paragraph>
        Customize button labels, messages, and screen texts in different
        languages. Custom text applies only to Universal Login screens.
      </Typography>

      {customTextEntries.length === 0 ? (
        <Typography color="textSecondary">
          No custom text configured yet. Click "Add Custom Text" to create your
          first customization.
        </Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Screen</TableCell>
                <TableCell>Language</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customTextEntries.map((entry) => (
                <TableRow key={`${entry.prompt}:${entry.language}`}>
                  <TableCell>{getScreenName(entry.prompt)}</TableCell>
                  <TableCell>{getLanguageName(entry.language)}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      onClick={() => handleEdit(entry)}
                      disabled={loading}
                      size="small"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDelete(entry)}
                      disabled={loading}
                      size="small"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Custom Text</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Screen"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              fullWidth
            >
              {PROMPT_SCREENS.map((screen) => (
                <MenuItem key={screen.id} value={screen.id}>
                  {screen.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Language"
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              fullWidth
            >
              {LANGUAGES.map((lang) => (
                <MenuItem key={lang.id} value={lang.id}>
                  {lang.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained" disabled={loading}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { minHeight: "80vh" } }}
      >
        <DialogTitle>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <span>
              Edit Custom Text -{" "}
              {selectedEntry && getScreenName(selectedEntry.prompt)} (
              {selectedEntry && getLanguageName(selectedEntry.language)})
            </span>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
            >
              <ToggleButton value="form">Form</ToggleButton>
              <ToggleButton value="json">JSON</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {viewMode === "form" ? (
              <>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  sx={{ mb: 2 }}
                >
                  Edit the values you want to customize. Clear a field to
                  revert to the default value. Variables like ${"{"}{" "}
                  clientName{"}"} will be replaced at runtime.
                </Typography>

                {/* Render per-screen sections */}
                {selectedEntry &&
                  Object.keys(editingTexts).map((screenName) => {
                      const screenTexts = editingTexts[screenName] || {};
                      const entries = Object.entries(screenTexts);
                      const screenNames = Object.keys(editingTexts);
                      const showScreenHeader = screenNames.length > 1;

                      // Categorize fields
                      const categories = {
                        "Page & Titles": [] as [string, string][],
                        "Buttons & Actions": [] as [string, string][],
                        "Input Fields": [] as [string, string][],
                        "Messages & Labels": [] as [string, string][],
                        "Error Messages": [] as [string, string][],
                      };

                      entries.forEach(([key, value]) => {
                        if (
                          key.includes("error") ||
                          key.includes("Error") ||
                          key.startsWith("wrong-") ||
                          key.startsWith("invalid-") ||
                          key.startsWith("no-") ||
                          key.includes("blocked") ||
                          key.includes("breached") ||
                          key.includes("failure") ||
                          key.includes("captcha")
                        ) {
                          categories["Error Messages"].push([key, value]);
                        } else if (
                          key.includes("Title") ||
                          key.includes("title") ||
                          key.includes("pageTitle") ||
                          key.includes("description") ||
                          key.includes("Description")
                        ) {
                          categories["Page & Titles"].push([key, value]);
                        } else if (
                          key.includes("button") ||
                          key.includes("Button") ||
                          key.includes("Action") ||
                          key.includes("Link") ||
                          (key.includes("Text") &&
                            (key.includes("footer") ||
                              key.includes("signup") ||
                              key.includes("login") ||
                              key.includes("forgot") ||
                              key.includes("back")))
                        ) {
                          categories["Buttons & Actions"].push([key, value]);
                        } else if (
                          key.includes("Placeholder") ||
                          key.includes("placeholder") ||
                          key.includes("Label") ||
                          key.includes("select")
                        ) {
                          categories["Input Fields"].push([key, value]);
                        } else {
                          categories["Messages & Labels"].push([key, value]);
                        }
                      });

                      const content = (
                        <>
                          <Box display="flex" justifyContent="flex-end" mb={1}>
                            <Button
                              size="small"
                              startIcon={<AddIcon />}
                              onClick={() => handleAddTextKey(screenName)}
                            >
                              Add Custom Key
                            </Button>
                          </Box>
                          {Object.entries(categories)
                            .filter(([_, items]) => items.length > 0)
                            .map(([category, items]) => (
                              <Accordion key={category} defaultExpanded>
                                <AccordionSummary
                                  expandIcon={<ExpandMoreIcon />}
                                >
                                  <Typography variant="subtitle1">
                                    {category}
                                    <Chip
                                      size="small"
                                      label={items.length}
                                      sx={{ ml: 1 }}
                                    />
                                  </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                  <Stack spacing={2}>
                                    {items.map(([key, value]) => (
                                      <Box
                                        key={key}
                                        display="flex"
                                        alignItems="flex-start"
                                        gap={1}
                                      >
                                        <TextField
                                          label={key}
                                          value={value}
                                          onChange={(e) =>
                                            handleTextChange(
                                              screenName,
                                              key,
                                              e.target.value,
                                            )
                                          }
                                          fullWidth
                                          multiline
                                          minRows={1}
                                          maxRows={4}
                                          helperText="Clear to use default value"
                                          InputLabelProps={{
                                            shrink: true,
                                          }}
                                        />
                                        <IconButton
                                          onClick={() =>
                                            handleRemoveTextKey(
                                              screenName,
                                              key,
                                            )
                                          }
                                          size="small"
                                          color="error"
                                          title="Remove field"
                                        >
                                          <DeleteIcon />
                                        </IconButton>
                                      </Box>
                                    ))}
                                  </Stack>
                                </AccordionDetails>
                              </Accordion>
                            ))}
                          {entries.length === 0 && (
                            <Typography color="textSecondary">
                              No text keys configured. Click "Add Custom Key" to
                              add customizations.
                            </Typography>
                          )}
                        </>
                      );

                      if (showScreenHeader) {
                        return (
                          <Accordion key={screenName} defaultExpanded>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="h6">{screenName}</Typography>
                            </AccordionSummary>
                            <AccordionDetails>{content}</AccordionDetails>
                          </Accordion>
                        );
                      }

                      return <Box key={screenName}>{content}</Box>;
                    },
                  )}
              </>
            ) : (
              <>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  sx={{ mb: 2 }}
                >
                  Edit all text values as JSON. You can copy and paste the
                  entire JSON object to quickly update all values.
                </Typography>
                {jsonError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {jsonError}
                  </Alert>
                )}
                <TextField
                  multiline
                  fullWidth
                  minRows={20}
                  maxRows={30}
                  value={jsonValue}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  error={!!jsonError}
                  sx={{
                    fontFamily: "monospace",
                    "& .MuiInputBase-input": {
                      fontFamily: "monospace",
                      fontSize: "0.875rem",
                    },
                  }}
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading || (viewMode === "json" && !!jsonError)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function PromptsEdit() {
  const transform = (data: Record<string, unknown>) => {
    return removeNullValues(data);
  };

  return (
    <Edit transform={transform}>
      <TabbedForm>
        <TabbedForm.Tab label="Settings">
          <Typography variant="h6" gutterBottom>
            Prompt Settings
          </Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            Configure how the login prompts behave for your users.
          </Typography>

          <Stack spacing={3} sx={{ maxWidth: 600 }}>
            <SelectInput
              source="universal_login_experience"
              label="Universal Login Experience"
              choices={[
                { id: "new", name: "New Universal Login" },
                { id: "classic", name: "Classic Universal Login" },
              ]}
              helperText="Choose between the new or classic Universal Login experience"
              fullWidth
            />

            <LoginFlowInput />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Custom Text">
          <CustomTextTab />
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
