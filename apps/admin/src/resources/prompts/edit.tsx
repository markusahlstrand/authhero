import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { useWatch, useFormContext } from "react-hook-form";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Edit, SelectInput, SimpleForm } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

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

type LoginFlowValue =
  | "identifier-password"
  | "identifier-first"
  | "identifier-first-biometrics";

function LoginFlowInput() {
  const { setValue } = useFormContext();
  const identifierFirst = useWatch({ name: "identifier_first" }) as
    | boolean
    | undefined;
  const webauthn = useWatch({ name: "webauthn_platform_first_factor" }) as
    | boolean
    | undefined;

  const current: LoginFlowValue = useMemo(() => {
    if (webauthn && identifierFirst) return "identifier-first-biometrics";
    if (identifierFirst === false) return "identifier-password";
    return "identifier-first";
  }, [identifierFirst, webauthn]);

  const handleChange = (value: string) => {
    const v = value as LoginFlowValue;
    switch (v) {
      case "identifier-password":
        setValue("identifier_first", false, { shouldDirty: true });
        setValue("webauthn_platform_first_factor", false, {
          shouldDirty: true,
        });
        break;
      case "identifier-first":
        setValue("identifier_first", true, { shouldDirty: true });
        setValue("webauthn_platform_first_factor", false, {
          shouldDirty: true,
        });
        break;
      case "identifier-first-biometrics":
        setValue("identifier_first", true, { shouldDirty: true });
        setValue("webauthn_platform_first_factor", true, { shouldDirty: true });
        break;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium">Login Flow</Label>
      <RadioGroup value={current} onValueChange={handleChange} className="gap-2">
        {LOGIN_FLOW_OPTIONS.map((option) => {
          const selected = current === option.value;
          return (
            <label
              key={option.value}
              htmlFor={`login-flow-${option.value}`}
              className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${
                selected
                  ? "border-primary bg-accent"
                  : "border-input hover:bg-accent/50"
              }`}
            >
              <RadioGroupItem
                value={option.value}
                id={`login-flow-${option.value}`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.isDefault && (
                    <Badge variant="outline" className="text-xs">
                      default
                    </Badge>
                  )}
                  {option.enterprise && (
                    <Badge className="text-xs">enterprise</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </div>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

function removeNullValues(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const cleaned = removeNullValues(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) result[key] = cleaned;
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

type ScreenTexts = Record<string, string>;
type PromptTexts = Record<string, ScreenTexts>;

interface PromptsRecord {
  customTextEntries?: CustomTextEntry[];
}

function getScreenName(prompt: string) {
  return PROMPT_SCREENS.find((s) => s.id === prompt)?.name ?? prompt;
}

function getLanguageName(lang: string) {
  return LANGUAGES.find((l) => l.id === lang)?.name ?? lang;
}

function categorizeKey(key: string): string {
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
    return "Error Messages";
  }
  if (
    key.includes("Title") ||
    key.includes("title") ||
    key.includes("pageTitle") ||
    key.includes("description") ||
    key.includes("Description")
  ) {
    return "Page & Titles";
  }
  if (
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
    return "Buttons & Actions";
  }
  if (
    key.includes("Placeholder") ||
    key.includes("placeholder") ||
    key.includes("Label") ||
    key.includes("select")
  ) {
    return "Input Fields";
  }
  return "Messages & Labels";
}

const CATEGORY_ORDER = [
  "Page & Titles",
  "Buttons & Actions",
  "Input Fields",
  "Messages & Labels",
  "Error Messages",
];

interface EditDialogProps {
  open: boolean;
  entry: CustomTextEntry | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function CustomTextEditDialog({
  open,
  entry,
  onOpenChange,
  onSaved,
}: EditDialogProps) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [texts, setTexts] = useState<PromptTexts>({});
  const [defaults, setDefaults] = useState<PromptTexts>({});
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Reset + load when the dialog opens for a new entry.
  const loadEntry = useCallback(async () => {
    if (!entry) return;
    setLoading(true);
    setLoaded(false);
    try {
      const [overrides, defaultsRes] = await Promise.all([
        dataProvider.getOne("custom-text", {
          id: `${entry.prompt}:${entry.language}`,
        }),
        dataProvider.getList("custom-text-defaults", {
          filter: { prompt: entry.prompt, language: entry.language },
          pagination: { page: 1, perPage: 1 },
          sort: { field: "prompt", order: "ASC" },
        }),
      ]);
      const overrideTexts: PromptTexts =
        (overrides.data as { texts?: PromptTexts })?.texts ?? {};
      const defaultsEntry = defaultsRes.data[0] as
        | { custom_text?: PromptTexts }
        | undefined;
      const defaultsData: PromptTexts = defaultsEntry?.custom_text ?? {};
      setTexts(overrideTexts);
      setDefaults(defaultsData);
      setJsonValue(JSON.stringify(overrideTexts, null, 2));
      setJsonError(null);
      setViewMode("form");
      setLoaded(true);
    } catch {
      notify("Error loading custom text", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [dataProvider, entry, notify]);

  useEffect(() => {
    if (open && entry) {
      loadEntry();
    } else if (!open) {
      setLoaded(false);
    }
  }, [open, entry, loadEntry]);

  const handleTextChange = useCallback(
    (screen: string, key: string, value: string) => {
      setTexts((prev) => {
        const next: PromptTexts = {
          ...prev,
          [screen]: { ...(prev[screen] ?? {}), [key]: value },
        };
        setJsonValue(JSON.stringify(next, null, 2));
        return next;
      });
    },
    [],
  );

  const handleAddKey = useCallback((screen: string) => {
    const key = window.prompt("Enter new text key:");
    if (!key) return;
    setTexts((prev) => {
      if (prev[screen]?.[key] !== undefined) return prev;
      const next: PromptTexts = {
        ...prev,
        [screen]: { ...(prev[screen] ?? {}), [key]: "" },
      };
      setJsonValue(JSON.stringify(next, null, 2));
      return next;
    });
  }, []);

  const handleRemoveKey = useCallback((screen: string, key: string) => {
    setTexts((prev) => {
      const screenTexts = { ...(prev[screen] ?? {}) };
      delete screenTexts[key];
      const next: PromptTexts = { ...prev, [screen]: screenTexts };
      setJsonValue(JSON.stringify(next, null, 2));
      return next;
    });
  }, []);

  const handleJsonChange = useCallback((value: string) => {
    setJsonValue(value);
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        setJsonError("JSON must be an object with nested screen objects");
        return;
      }
      const result: PromptTexts = {};
      for (const [screen, screenTexts] of Object.entries(
        parsed as Record<string, unknown>,
      )) {
        if (
          screenTexts === null ||
          typeof screenTexts !== "object" ||
          Array.isArray(screenTexts)
        ) {
          setJsonError(
            `Value for "${screen}" must be an object with string values`,
          );
          return;
        }
        const screenResult: ScreenTexts = {};
        for (const [k, v] of Object.entries(
          screenTexts as Record<string, unknown>,
        )) {
          if (typeof v !== "string") {
            setJsonError(`All values in "${screen}" must be strings`);
            return;
          }
          screenResult[k] = v;
        }
        result[screen] = screenResult;
      }
      setTexts(result);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  }, []);

  const handleViewModeChange = useCallback(
    (value: string) => {
      if (!value) return;
      const newMode = value as "form" | "json";
      if (newMode === "json") {
        setJsonValue(JSON.stringify(texts, null, 2));
        setJsonError(null);
      }
      setViewMode(newMode);
    },
    [texts],
  );

  const handleSave = useCallback(async () => {
    if (!entry) return;
    let textsToSave = texts;
    if (viewMode === "json") {
      if (jsonError) {
        notify(jsonError, { type: "error" });
        return;
      }
      try {
        textsToSave = JSON.parse(jsonValue) as PromptTexts;
      } catch {
        notify("Invalid JSON format", { type: "error" });
        return;
      }
    }

    // Filter empty strings per screen so cleared fields fall back to defaults.
    const filtered: PromptTexts = {};
    for (const [screen, screenTexts] of Object.entries(textsToSave)) {
      const cleaned: ScreenTexts = {};
      for (const [k, v] of Object.entries(screenTexts)) {
        if (typeof v === "string" && v.trim() !== "") cleaned[k] = v;
      }
      if (Object.keys(cleaned).length > 0) filtered[screen] = cleaned;
    }

    setLoading(true);
    try {
      await dataProvider.update("custom-text", {
        id: `${entry.prompt}:${entry.language}`,
        data: { texts: filtered },
        previousData: {},
      });
      notify("Custom text updated", { type: "success" });
      onSaved();
      onOpenChange(false);
    } catch {
      notify("Error updating custom text", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [
    dataProvider,
    entry,
    texts,
    viewMode,
    jsonValue,
    jsonError,
    notify,
    onSaved,
    onOpenChange,
  ]);

  const screensWithCategories = useMemo(() => {
    const screenNames = Array.from(
      new Set([...Object.keys(defaults), ...Object.keys(texts)]),
    );
    return screenNames.map((screen) => {
      const screenDefaults = defaults[screen] ?? {};
      const screenTexts = texts[screen] ?? {};
      const keys = Array.from(
        new Set([
          ...Object.keys(screenDefaults),
          ...Object.keys(screenTexts),
        ]),
      );
      const categories = new Map<string, Array<[string, string]>>();
      for (const key of keys) {
        const cat = categorizeKey(key);
        if (!categories.has(cat)) categories.set(cat, []);
        categories.get(cat)!.push([key, screenTexts[key] ?? ""]);
      }
      const orderedCategories = CATEGORY_ORDER.filter((c) =>
        categories.has(c),
      ).map((c) => [c, categories.get(c)!] as const);
      return { screen, defaults: screenDefaults, orderedCategories };
    });
  }, [defaults, texts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Edit Custom Text
            {entry && (
              <span className="text-muted-foreground font-normal">
                {" "}
                — {getScreenName(entry.prompt)} (
                {getLanguageName(entry.language)})
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Edit the values you want to customize. Clear a field to revert to
            the default. Variables like {"${clientName}"} are replaced at
            runtime.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end pb-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={viewMode}
            onValueChange={handleViewModeChange}
          >
            <ToggleGroupItem value="form">Form</ToggleGroupItem>
            <ToggleGroupItem value="json">JSON</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {loading && !loaded ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Loading…
            </p>
          ) : viewMode === "form" ? (
            <div className="flex flex-col gap-4">
              {screensWithCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No default text shipped for this screen/language. Use the JSON
                  view to add custom keys.
                </p>
              ) : (
                screensWithCategories.map(
                  ({ screen, defaults: screenDefaults, orderedCategories }) => {
                    const showHeader = screensWithCategories.length > 1;
                    const body = (
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddKey(screen)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add custom key
                          </Button>
                        </div>
                        <Accordion
                          type="multiple"
                          defaultValue={orderedCategories.map(([c]) => c)}
                          className="flex flex-col gap-2"
                        >
                          {orderedCategories.map(([category, items]) => (
                            <AccordionItem
                              key={category}
                              value={category}
                              className="rounded-md border px-3"
                            >
                              <AccordionTrigger className="hover:no-underline">
                                <span className="flex items-center gap-2 text-sm font-medium">
                                  {category}
                                  <Badge variant="secondary">
                                    {items.length}
                                  </Badge>
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="flex flex-col gap-3 pt-2">
                                  {items.map(([key, value]) => {
                                    const defaultValue = screenDefaults[key];
                                    return (
                                      <div
                                        key={key}
                                        className="flex items-start gap-2"
                                      >
                                        <div className="flex-1 flex flex-col gap-1">
                                          <Label
                                            htmlFor={`${screen}-${key}`}
                                            className="text-xs font-mono text-muted-foreground"
                                          >
                                            {key}
                                          </Label>
                                          <Textarea
                                            id={`${screen}-${key}`}
                                            value={value}
                                            onChange={(e) =>
                                              handleTextChange(
                                                screen,
                                                key,
                                                e.target.value,
                                              )
                                            }
                                            placeholder={defaultValue ?? ""}
                                            rows={1}
                                            className="min-h-9 resize-y"
                                          />
                                          {defaultValue ? (
                                            <p className="text-xs text-muted-foreground truncate">
                                              Default: {defaultValue}
                                            </p>
                                          ) : (
                                            <p className="text-xs text-muted-foreground">
                                              Clear to use default
                                            </p>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="mt-5"
                                          onClick={() =>
                                            handleRemoveKey(screen, key)
                                          }
                                          aria-label="Remove field"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    );
                    if (!showHeader) return <div key={screen}>{body}</div>;
                    return (
                      <Accordion
                        key={screen}
                        type="single"
                        collapsible
                        defaultValue={screen}
                      >
                        <AccordionItem
                          value={screen}
                          className="rounded-md border px-3"
                        >
                          <AccordionTrigger className="hover:no-underline">
                            <span className="text-base font-medium">
                              {screen}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>{body}</AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    );
                  },
                )
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {jsonError && (
                <Alert variant="destructive">
                  <AlertDescription>{jsonError}</AlertDescription>
                </Alert>
              )}
              <Textarea
                value={jsonValue}
                onChange={(e) => handleJsonChange(e.target.value)}
                rows={20}
                className="font-mono text-xs"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || (viewMode === "json" && !!jsonError)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomTextTab() {
  const record = useRecordContext<PromptsRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [createOpen, setCreateOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newLanguage, setNewLanguage] = useState("en");
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<CustomTextEntry | null>(null);

  const entries: CustomTextEntry[] = record?.customTextEntries ?? [];

  const handleCreate = useCallback(async () => {
    if (!newPrompt || !newLanguage) {
      notify("Please select a screen and language", { type: "warning" });
      return;
    }
    setCreating(true);
    try {
      await dataProvider.create("custom-text", {
        data: { prompt: newPrompt, language: newLanguage, texts: {} },
      });
      notify("Custom text created", { type: "success" });
      setCreateOpen(false);
      setNewPrompt("");
      // Open editor straight after create so the user can fill it in.
      setEditEntry({ prompt: newPrompt, language: newLanguage });
      setEditOpen(true);
      refresh();
    } catch {
      notify("Error creating custom text", { type: "error" });
    } finally {
      setCreating(false);
    }
  }, [dataProvider, newPrompt, newLanguage, notify, refresh]);

  const handleDelete = useCallback(
    async (entry: CustomTextEntry) => {
      if (
        !window.confirm(
          `Delete custom text for ${getScreenName(entry.prompt)} (${getLanguageName(entry.language)})?`,
        )
      ) {
        return;
      }
      try {
        await dataProvider.delete("custom-text", {
          id: `${entry.prompt}:${entry.language}`,
        });
        notify("Custom text deleted", { type: "success" });
        refresh();
      } catch {
        notify("Error deleting custom text", { type: "error" });
      }
    },
    [dataProvider, notify, refresh],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Customize button labels, messages, and screen texts per language for
          the Universal Login screens. Fields you leave blank fall back to the
          shipped defaults.
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add custom text
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No custom text configured yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Screen</TableHead>
                <TableHead>Language</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={`${entry.prompt}:${entry.language}`}>
                  <TableCell>{getScreenName(entry.prompt)}</TableCell>
                  <TableCell>{getLanguageName(entry.language)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      onClick={() => {
                        setEditEntry(entry);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                      onClick={() => handleDelete(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add custom text</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-prompt">Screen</Label>
              <Select value={newPrompt} onValueChange={setNewPrompt}>
                <SelectTrigger id="new-prompt">
                  <SelectValue placeholder="Select a screen" />
                </SelectTrigger>
                <SelectContent>
                  {PROMPT_SCREENS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-language">Language</Label>
              <Select value={newLanguage} onValueChange={setNewLanguage}>
                <SelectTrigger id="new-language">
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomTextEditDialog
        open={editOpen}
        entry={editEntry}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditEntry(null);
        }}
        onSaved={refresh}
      />
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <SelectInput
        source="universal_login_experience"
        label="Universal Login Experience"
        choices={[
          { id: "new", name: "New Universal Login" },
          { id: "classic", name: "Classic Universal Login" },
        ]}
        helperText="Choose between the new or classic Universal Login experience"
      />
      <LoginFlowInput />
    </div>
  );
}

function PromptsFormContent() {
  return (
    <UrlTabs defaultValue="settings" className="w-full">
      <TabsList>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="custom-text">Custom Text</TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="mt-4">
        <SettingsTab />
      </TabsContent>
      <TabsContent value="custom-text" className="mt-4">
        <CustomTextTab />
      </TabsContent>
    </UrlTabs>
  );
}

export function PromptsEdit() {
  const transform = (data: Record<string, unknown>) => {
    const { customTextEntries: _customTextEntries, ...rest } = data;
    return removeNullValues(rest);
  };

  return (
    <Edit
      mutationMode="pessimistic"
      redirect={false}
      title="Prompts"
      transform={transform}
    >
      <SimpleForm className="max-w-none">
        <PromptsFormContent />
      </SimpleForm>
    </Edit>
  );
}
