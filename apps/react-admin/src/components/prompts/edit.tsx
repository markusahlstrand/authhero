import {
  Edit,
  TabbedForm,
  SelectInput,
  BooleanInput,
  useRecordContext,
  useDataProvider,
  useNotify,
  useRefresh,
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
} from "@mui/material";
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

// Default text keys for each screen type
const DEFAULT_TEXT_KEYS: Record<string, string[]> = {
  login: [
    "pageTitle",
    "title",
    "description",
    "buttonText",
    "signupActionLinkText",
    "signupActionText",
    "forgotPasswordText",
    "usernameLabel",
    "usernameOrEmailLabel",
    "emailLabel",
    "phoneLabel",
    "passwordLabel",
    "separatorText",
    "continueWithText",
    "invitationTitle",
    "invitationDescription",
    "alertListTitle",
    "wrongEmailOrPasswordErrorText",
    "invalidEmailErrorText",
    "passwordRequiredErrorText",
    "captchaErrorText",
  ],
  signup: [
    "pageTitle",
    "title",
    "description",
    "buttonText",
    "loginActionLinkText",
    "loginActionText",
    "usernameLabel",
    "emailLabel",
    "phoneLabel",
    "passwordLabel",
    "confirmPasswordLabel",
    "termsText",
    "privacyPolicyText",
    "separatorText",
    "continueWithText",
  ],
  "reset-password": [
    "pageTitle",
    "title",
    "description",
    "buttonText",
    "backToLoginText",
    "emailLabel",
    "successTitle",
    "successDescription",
  ],
  common: [
    "alertListTitle",
    "showPasswordText",
    "hidePasswordText",
    "continueText",
    "orText",
    "termsOfServiceText",
    "privacyPolicyText",
    "contactSupportText",
    "copyrightText",
  ],
};

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
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({});
  const [newPrompt, setNewPrompt] = useState("");
  const [newLanguage, setNewLanguage] = useState("en");
  const [loading, setLoading] = useState(false);

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
      // Get default text keys for this screen
      const defaultKeys = DEFAULT_TEXT_KEYS[newPrompt] || [];
      const initialTexts: Record<string, string> = {};
      defaultKeys.forEach((key) => {
        initialTexts[key] = "";
      });

      await dataProvider.create("custom-text", {
        data: {
          prompt: newPrompt,
          language: newLanguage,
          texts: initialTexts,
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
        setEditingTexts(result.data.texts || {});
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

    setLoading(true);
    try {
      await dataProvider.update("custom-text", {
        id: `${selectedEntry.prompt}:${selectedEntry.language}`,
        data: { texts: editingTexts },
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
  }, [dataProvider, selectedEntry, editingTexts, notify, refresh]);

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

  const handleTextChange = useCallback((key: string, value: string) => {
    setEditingTexts((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleAddTextKey = useCallback(() => {
    const key = window.prompt("Enter new text key:");
    if (key && !editingTexts[key]) {
      setEditingTexts((prev) => ({ ...prev, [key]: "" }));
    }
  }, [editingTexts]);

  const handleRemoveTextKey = useCallback((key: string) => {
    setEditingTexts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
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
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Edit Custom Text -{" "}
          {selectedEntry && getScreenName(selectedEntry.prompt)} (
          {selectedEntry && getLanguageName(selectedEntry.language)})
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Box display="flex" justifyContent="flex-end" mb={2}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddTextKey}
              >
                Add Text Key
              </Button>
            </Box>
            <Stack spacing={2}>
              {Object.entries(editingTexts).map(([key, value]) => (
                <Box key={key} display="flex" alignItems="flex-start" gap={1}>
                  <TextField
                    label={key}
                    value={value}
                    onChange={(e) => handleTextChange(key, e.target.value)}
                    fullWidth
                    multiline
                    minRows={1}
                    maxRows={4}
                  />
                  <IconButton
                    onClick={() => handleRemoveTextKey(key)}
                    size="small"
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
              {Object.keys(editingTexts).length === 0 && (
                <Typography color="textSecondary">
                  No text keys configured. Click "Add Text Key" to add
                  customizations.
                </Typography>
              )}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={loading}>
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

          <Stack spacing={2} sx={{ maxWidth: 600 }}>
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

            <BooleanInput
              source="identifier_first"
              label="Identifier First"
              helperText="Show identifier (email/username) field first, then password on a separate screen"
            />

            <BooleanInput
              source="password_first"
              label="Password First"
              helperText="Show password field on the first screen along with the identifier"
            />

            <BooleanInput
              source="webauthn_platform_first_factor"
              label="WebAuthn Platform First Factor"
              helperText="Enable WebAuthn (passkeys, biometrics) as a first factor authentication option"
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Custom Text">
          <CustomTextTab />
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
