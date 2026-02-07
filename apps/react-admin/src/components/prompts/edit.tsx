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
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
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

// Default text keys for each screen type with their default values
const DEFAULT_TEXT_KEYS: Record<string, Record<string, string>> = {
  login: {
    pageTitle: "Log in | ${clientName}",
    title: "Welcome",
    description: "Log in to continue",
    separatorText: "Or",
    buttonText: "Continue",
    federatedConnectionButtonText: "Continue with ${connectionName}",
    footerLinkText: "Sign up",
    signupActionLinkText: "${footerLinkText}",
    footerText: "Don't have an account?",
    signupActionText: "${footerText}",
    forgotPasswordText: "Forgot password?",
    passwordPlaceholder: "Password",
    usernamePlaceholder: "Username or email address",
    emailPlaceholder: "Email address",
    phonePlaceholder: "Phone number",
    editEmailText: "Edit",
    alertListTitle: "Alerts",
    invitationTitle: "You've Been Invited!",
    invitationDescription:
      "Log in to accept ${inviterName}'s invitation to join ${companyName} on ${clientName}.",
    logoAltText: "${companyName}",
    showPasswordText: "Show password",
    hidePasswordText: "Hide password",
  },
  "login-id": {
    pageTitle: "Log in | ${clientName}",
    title: "Welcome",
    description: "Login to continue",
    separatorText: "Or",
    buttonText: "Continue",
    federatedConnectionButtonText: "Continue with ${connectionName}",
    footerLinkText: "Sign up",
    signupActionLinkText: "${footerLinkText}",
    footerText: "Don't have an account?",
    signupActionText: "${footerText}",
    forgotPasswordText: "Forgot password?",
    passwordPlaceholder: "Password",
    usernamePlaceholder: "Username or email address",
    emailPlaceholder: "Email address",
    phonePlaceholder: "Phone number",
    usernameOnlyPlaceholder: "Username",
    phoneOrUsernameOrEmailPlaceholder: "Phone or Username or Email",
    phoneOrEmailPlaceholder: "Phone number or Email address",
    phoneOrUsernamePlaceholder: "Phone Number or Username",
    usernameOrEmailPlaceholder: "Username or Email address",
    editEmailText: "Edit",
    alertListTitle: "Alerts",
    invitationTitle: "You've Been Invited!",
    invitationDescription:
      "Log in to accept ${inviterName}'s invitation to join ${companyName} on ${clientName}.",
    termsAndConditionsTemplate:
      'By continuing, you agree to our <a href="${termsAndConditionsUrl}" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>.',
    captchaCodePlaceholder: "Enter the code shown above",
    logoAltText: "${companyName}",
    showPasswordText: "Show password",
    hidePasswordText: "Hide password",
    selectCountryCode:
      "Select country code, currently set to ${countryName}, ${countryCode}, +${countryPrefix}",
    "wrong-credentials": "Wrong username or password",
    "wrong-email-credentials": "Wrong email or password",
    "wrong-username-credentials": "Incorrect username or password",
    "wrong-phone-credentials": "Incorrect phone number or password",
    "wrong-email-username-credentials":
      "Incorrect email address, username, or password",
    "wrong-email-phone-username-credentials":
      "Incorrect email address, phone number, username, or password. Phone numbers must include the country code.",
    "wrong-email-phone-credentials":
      "Incorrect email address, phone number, or password. Phone numbers must include the country code.",
    "wrong-phone-username-credentials":
      "Incorrect phone number, username or password. Phone numbers must include the country code.",
    "invalid-code": "The code you entered is invalid",
    "invalid-expired-code": "Invalid or expired user code",
    "custom-script-error-code": "Something went wrong, please try again later.",
    "auth0-users-validation": "Something went wrong, please try again later",
    "authentication-failure":
      "We are sorry, something went wrong when attempting to log in",
    "invalid-connection": "Invalid connection",
    "ip-blocked":
      "We have detected suspicious login behavior and further attempts will be blocked. Please contact the administrator.",
    "no-db-connection": "Invalid connection",
    "password-breached":
      "We have detected a potential security issue with this account. To protect your account, we have prevented this login. Please reset your password to proceed.",
    "user-blocked":
      "Your account has been blocked after multiple consecutive login attempts.",
    "same-user-login":
      "Too many login attempts for this user. Please wait, and try again later.",
    "invalid-email-format": "Email is not valid.",
    "invalid-username":
      "Username can only contain alphanumeric characters or: '${characters}'. Username should have between ${min} and ${max} characters.",
    "invalid-login-id": "Invalid Login ID entered",
    "invalid-email-phone":
      "Enter a valid email address or phone number. Phone numbers must include the country code.",
    "invalid-email-username": "Enter a valid email address or username",
    "invalid-phone-username":
      "Enter a valid phone number or username. Phone numbers must include the country code.",
    "invalid-email-phone-username":
      "Enter a valid email address, phone number or username. Phone numbers must include the country code.",
    "no-email": "Please enter an email address",
    "no-password": "Password is required",
    "no-username": "Username is required",
    "no-phone": "Please enter a phone number",
    "no-email-username": "Email address or username is required",
    "no-email-phone": "Email address or phone number is required",
    "no-phone-username": "Phone number or username is required",
    "no-email-phone-username":
      "Phone number, username, or email address is required",
    "captcha-validation-failure":
      "We are sorry, something went wrong while validating the captcha response. Please try again.",
    "invalid-recaptcha": "Select the checkbox to verify you are not a robot.",
    "invalid-captcha":
      "Solve the challenge question to verify you are not a robot.",
    "captcha-client-failure":
      "We couldn't load the security challenge. Please try again. (Error code: #{errorCode})",
  },
  "login-password": {
    pageTitle: "Log in | ${clientName}",
    title: "Enter your password",
    description: "Log in to ${clientName}",
    buttonText: "Continue",
    forgotPasswordText: "Forgot password?",
    passwordPlaceholder: "Password",
    showPasswordText: "Show password",
    hidePasswordText: "Hide password",
    "wrong-credentials": "Wrong password",
    "no-password": "Password is required",
    "user-blocked":
      "Your account has been blocked after multiple consecutive login attempts.",
    "password-breached":
      "We have detected a potential security issue with this account. To protect your account, we have prevented this login. Please reset your password to proceed.",
  },
  signup: {
    pageTitle: "Sign up | ${clientName}",
    title: "Create your account",
    description: "Sign up to continue",
    buttonText: "Continue",
    loginActionLinkText: "Log in",
    loginActionText: "Already have an account?",
    separatorText: "Or",
    federatedConnectionButtonText: "Continue with ${connectionName}",
    emailPlaceholder: "Email address",
    passwordPlaceholder: "Password",
    usernamePlaceholder: "Username",
    phonePlaceholder: "Phone number",
    showPasswordText: "Show password",
    hidePasswordText: "Hide password",
    termsText: "By signing up, you agree to our",
    termsOfServiceLinkText: "Terms of Service",
    privacyPolicyLinkText: "Privacy Policy",
    "invalid-email-format": "Email is not valid.",
    "no-email": "Please enter an email address",
    "no-password": "Password is required",
    "no-username": "Username is required",
    "email-already-exists": "This email is already registered",
    "username-already-exists": "This username is already taken",
  },
  "signup-id": {
    pageTitle: "Sign up | ${clientName}",
    title: "Create your account",
    description: "Sign up to continue",
    buttonText: "Continue",
    loginActionLinkText: "Log in",
    loginActionText: "Already have an account?",
    separatorText: "Or",
    federatedConnectionButtonText: "Continue with ${connectionName}",
    emailPlaceholder: "Email address",
    usernamePlaceholder: "Username",
    phonePlaceholder: "Phone number",
    "invalid-email-format": "Email is not valid.",
    "no-email": "Please enter an email address",
    "email-already-exists": "This email is already registered",
  },
  "signup-password": {
    pageTitle: "Sign up | ${clientName}",
    title: "Create your password",
    description: "Sign up to continue",
    buttonText: "Continue",
    passwordPlaceholder: "Password",
    showPasswordText: "Show password",
    hidePasswordText: "Hide password",
    "no-password": "Password is required",
    "password-too-weak": "Password is too weak",
    "password-policy-not-met": "Password does not meet the requirements",
  },
  "reset-password": {
    pageTitle: "Reset Password | ${clientName}",
    title: "Forgot your password?",
    description: "Enter your email to reset your password",
    buttonText: "Continue",
    backToLoginText: "Back to login",
    emailPlaceholder: "Email address",
    successTitle: "Check your email",
    successDescription:
      "We have sent a password reset link to your email address.",
    "invalid-email-format": "Email is not valid.",
    "no-email": "Please enter an email address",
    "user-not-found": "User not found",
  },
  consent: {
    pageTitle: "Authorize | ${clientName}",
    title: "Authorize ${clientName}",
    description: "${clientName} is requesting access to your account",
    buttonText: "Accept",
    cancelButtonText: "Deny",
    scopesTitle: "This will allow ${clientName} to:",
  },
  mfa: {
    pageTitle: "Multi-Factor Authentication | ${clientName}",
    title: "Verify your identity",
    description: "Choose a verification method",
    backupCodeText: "Use backup code",
  },
  "mfa-otp": {
    pageTitle: "Enter Code | ${clientName}",
    title: "Enter your code",
    description: "Enter the 6-digit code from your authenticator app",
    buttonText: "Continue",
    codePlaceholder: "Enter code",
    "invalid-code": "The code you entered is invalid",
  },
  "mfa-sms": {
    pageTitle: "SMS Verification | ${clientName}",
    title: "Check your phone",
    description: "We sent a code to ${phoneNumber}",
    buttonText: "Continue",
    resendText: "Resend code",
    codePlaceholder: "Enter code",
    "invalid-code": "The code you entered is invalid",
  },
  "mfa-email": {
    pageTitle: "Email Verification | ${clientName}",
    title: "Check your email",
    description: "We sent a code to ${email}",
    buttonText: "Continue",
    resendText: "Resend code",
    codePlaceholder: "Enter code",
    "invalid-code": "The code you entered is invalid",
  },
  "mfa-push": {
    pageTitle: "Push Notification | ${clientName}",
    title: "Approve the request",
    description: "We sent a notification to your device",
    resendText: "Resend notification",
    useCodeText: "Enter code manually",
  },
  "mfa-webauthn": {
    pageTitle: "Security Key | ${clientName}",
    title: "Use your security key",
    description: "Insert your security key and follow the instructions",
    buttonText: "Try again",
  },
  "mfa-voice": {
    pageTitle: "Voice Call | ${clientName}",
    title: "Receive a phone call",
    description: "We will call ${phoneNumber} with your code",
    buttonText: "Call me",
    codePlaceholder: "Enter code",
    "invalid-code": "The code you entered is invalid",
  },
  "mfa-phone": {
    pageTitle: "Phone Verification | ${clientName}",
    title: "Verify your phone",
    description: "Enter your phone number to receive a verification code",
    buttonText: "Continue",
    phonePlaceholder: "Phone number",
    smsOptionText: "Text me",
    voiceOptionText: "Call me",
  },
  "mfa-recovery-code": {
    pageTitle: "Recovery Code | ${clientName}",
    title: "Enter recovery code",
    description: "Enter one of your recovery codes",
    buttonText: "Continue",
    codePlaceholder: "Recovery code",
    "invalid-code": "The recovery code you entered is invalid",
  },
  status: {
    pageTitle: "Status | ${clientName}",
    title: "Status",
    successTitle: "Success",
    errorTitle: "Error",
    continueButtonText: "Continue",
  },
  "device-flow": {
    pageTitle: "Device Activation | ${clientName}",
    title: "Activate your device",
    description: "Enter the code shown on your device",
    buttonText: "Continue",
    codePlaceholder: "Enter code",
    "invalid-code": "The code you entered is invalid",
    "expired-code": "The code has expired",
  },
  "email-verification": {
    pageTitle: "Verify Email | ${clientName}",
    title: "Verify your email",
    description: "We sent an email to ${email}",
    resendText: "Resend email",
    successTitle: "Email verified",
    successDescription: "Your email has been verified successfully.",
  },
  "email-otp-challenge": {
    pageTitle: "Enter Code | ${clientName}",
    title: "Check your email",
    description: "We sent a code to ${email}",
    buttonText: "Continue",
    resendText: "Resend code",
    codePlaceholder: "Enter code",
    "invalid-code": "The code you entered is invalid",
  },
  organizations: {
    pageTitle: "Select Organization | ${clientName}",
    title: "Select your organization",
    description: "Choose which organization to log in to",
    searchPlaceholder: "Search organizations",
  },
  invitation: {
    pageTitle: "Invitation | ${clientName}",
    title: "You've been invited",
    description:
      "${inviterName} has invited you to join ${organizationName} on ${clientName}",
    acceptButtonText: "Accept invitation",
  },
  common: {
    alertListTitle: "Alerts",
    showPasswordText: "Show password",
    hidePasswordText: "Hide password",
    continueText: "Continue",
    orText: "or",
    termsOfServiceText: "Terms of Service",
    privacyPolicyText: "Privacy Policy",
    contactSupportText: "Contact Support",
    copyrightText: "© ${currentYear} ${companyName}",
    backText: "Back",
    cancelText: "Cancel",
    closeText: "Close",
    loadingText: "Loading...",
    errorText: "An error occurred",
    tryAgainText: "Try again",
  },
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
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const customTextEntries: CustomTextEntry[] = record?.customTextEntries || [];

  // Get default texts for a screen, merged with existing values
  const getTextsWithDefaults = useCallback(
    (prompt: string, existingTexts: Record<string, string>) => {
      const defaults = DEFAULT_TEXT_KEYS[prompt] || {};
      const result: Record<string, string> = {};

      // Add all default keys first (preserving order)
      for (const key of Object.keys(defaults)) {
        result[key] = existingTexts[key] ?? "";
      }

      // Add any custom keys that aren't in defaults
      for (const key of Object.keys(existingTexts)) {
        if (!(key in result) && existingTexts[key] !== undefined) {
          result[key] = existingTexts[key]!;
        }
      }

      return result;
    },
    [],
  );

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
      // Get default text keys for this screen (empty values)
      const defaults = DEFAULT_TEXT_KEYS[newPrompt] || {};
      const initialTexts: Record<string, string> = {};
      Object.keys(defaults).forEach((key) => {
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
        const textsWithDefaults = getTextsWithDefaults(
          entry.prompt,
          result.data.texts || {},
        );
        setEditingTexts(textsWithDefaults);
        setJsonValue(JSON.stringify(textsWithDefaults, null, 2));
        setJsonError(null);
        setViewMode("form");
        setEditDialogOpen(true);
      } catch (error) {
        notify("Error loading custom text", { type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [dataProvider, notify, getTextsWithDefaults],
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
          notify("JSON must be an object with string values", { type: "error" });
          return;
        }
        // Validate all values are strings
        const invalidKeys = Object.entries(textsToSave)
          .filter(([, value]) => value !== null && typeof value !== "string")
          .map(([key]) => key);
        if (invalidKeys.length > 0) {
          notify(
            `Invalid values for keys: ${invalidKeys.join(", ")}. All values must be strings.`,
            { type: "error" },
          );
          return;
        }
      } catch (e) {
        notify("Invalid JSON format", { type: "error" });
        return;
      }
    }

    // Filter out empty/null values before saving
    const filteredTexts: Record<string, string> = {};
    for (const [key, value] of Object.entries(textsToSave)) {
      if (value && typeof value === "string" && value.trim() !== "") {
        filteredTexts[key] = value;
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
  }, [dataProvider, selectedEntry, editingTexts, jsonValue, viewMode, notify, refresh]);

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
    setEditingTexts((prev) => {
      const newTexts = { ...prev, [key]: value };
      setJsonValue(JSON.stringify(newTexts, null, 2));
      return newTexts;
    });
  }, []);

  const handleJsonChange = useCallback((value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        setJsonError("JSON must be an object with string values");
        return;
      }
      // Validate all values are strings or null
      const hasInvalidValues = Object.values(parsed).some(
        (v) => v !== null && typeof v !== "string",
      );
      if (hasInvalidValues) {
        setJsonError("All values must be strings");
        return;
      }
      // Filter to only string values for the form state
      const stringOnly: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") {
          stringOnly[k] = v;
        }
      }
      setEditingTexts(stringOnly);
      setJsonError(null);
    } catch (e) {
      setJsonError("Invalid JSON");
    }
  }, []);

  const handleViewModeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newMode: "form" | "json" | null) => {
      if (newMode !== null) {
        // Sync data between views
        if (newMode === "json") {
          setJsonValue(JSON.stringify(editingTexts, null, 2));
          setJsonError(null);
        } else if (newMode === "form" && !jsonError) {
          try {
            const parsed = JSON.parse(jsonValue);
            // Validate before updating form state
            if (
              parsed !== null &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              // Filter to only string values
              const stringOnly: Record<string, string> = {};
              for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === "string") {
                  stringOnly[k] = v;
                }
              }
              setEditingTexts(stringOnly);
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
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  mb={2}
                >
                  <Typography variant="body2" color="textSecondary">
                    Fill in the values you want to customize. Empty fields will
                    use the default values. Variables like ${"{"}clientName{"}"}{" "}
                    will be replaced at runtime.
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleAddTextKey}
                  >
                    Add Custom Key
                  </Button>
                </Box>

                {/* Group fields by category */}
                {(() => {
                  const entries = Object.entries(editingTexts);
                  const defaults = selectedEntry
                    ? DEFAULT_TEXT_KEYS[selectedEntry.prompt] || {}
                    : {};

                  // Categorize fields
                  const categories = {
                    "Page & Titles": [] as [string, string][],
                    "Buttons & Actions": [] as [string, string][],
                    "Input Fields": [] as [string, string][],
                    "Messages & Labels": [] as [string, string][],
                    "Error Messages": [] as [string, string][],
                    "Custom Fields": [] as [string, string][],
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
                    } else if (!(key in defaults)) {
                      categories["Custom Fields"].push([key, value]);
                    } else {
                      categories["Messages & Labels"].push([key, value]);
                    }
                  });

                  return Object.entries(categories)
                    .filter(([_, items]) => items.length > 0)
                    .map(([category, items]) => (
                      <Accordion key={category} defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
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
                            {items.map(([key, value]) => {
                              const defaultValue = defaults[key] || "";
                              const isCustom = !(key in defaults);
                              return (
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
                                      handleTextChange(key, e.target.value)
                                    }
                                    fullWidth
                                    multiline
                                    minRows={1}
                                    maxRows={4}
                                    placeholder={defaultValue}
                                    helperText={
                                      defaultValue && !isCustom
                                        ? `Default: ${defaultValue.length > 80 ? defaultValue.substring(0, 80) + "..." : defaultValue}`
                                        : isCustom
                                          ? "Custom field"
                                          : undefined
                                    }
                                    InputLabelProps={{
                                      shrink: true,
                                    }}
                                  />
                                  <IconButton
                                    onClick={() => handleRemoveTextKey(key)}
                                    size="small"
                                    color="error"
                                    title="Remove field"
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Box>
                              );
                            })}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    ));
                })()}

                {Object.keys(editingTexts).length === 0 && (
                  <Typography color="textSecondary">
                    No text keys configured. Click "Add Custom Key" to add
                    customizations.
                  </Typography>
                )}
              </>
            ) : (
              <>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  Edit all text values as JSON. You can copy and paste the entire
                  JSON object to quickly update all values.
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
