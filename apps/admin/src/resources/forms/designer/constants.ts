import type { Operator } from "./types";

export const ENDING_TARGET = "$ending";

export const NODE_KIND_ACCENT: Record<string, string> = {
  start: "from-emerald-500/15 to-emerald-500/0 border-emerald-500/30",
  step: "from-primary/15 to-primary/0 border-primary/30",
  flow: "from-sky-500/15 to-sky-500/0 border-sky-500/30",
  router: "from-violet-500/15 to-violet-500/0 border-violet-500/30",
  end: "from-rose-500/15 to-rose-500/0 border-rose-500/30",
};

export const NODE_HANDLE_COLOR: Record<string, string> = {
  start: "bg-emerald-500",
  step: "bg-primary",
  flow: "bg-sky-500",
  router: "bg-violet-500",
  end: "bg-rose-500",
};

/**
 * xyflow's <marker> SVG element fill cannot be a CSS variable — it's evaluated
 * once at canvas init and ignores live theme changes. We use literal hex that
 * looks acceptable in both light and dark themes. Edge `style.stroke` itself
 * can use CSS vars and will adapt to theme.
 */
export const EDGE_COLORS = {
  primary: "#6366f1",
  router: "#a855f7",
} as const;

export const FLOW_CONFIG = {
  fitViewOptions: { padding: 0.2, includeHiddenNodes: false },
  minZoom: 0.4,
  maxZoom: 1.6,
} as const;

export const OPERATOR_OPTIONS: Array<{ value: Operator; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "exists", label: "Exists" },
  { value: "not_exists", label: "Does not exist" },
];

export const VALUELESS_OPERATORS: Operator[] = ["exists", "not_exists"];

export interface RouterFieldOption {
  value: string;
  label: string;
  group: string;
}

export const ROUTER_FIELD_OPTIONS: RouterFieldOption[] = [
  { value: "email", label: "Email", group: "User profile" },
  { value: "name", label: "Name", group: "User profile" },
  { value: "given_name", label: "Given name", group: "User profile" },
  { value: "family_name", label: "Family name", group: "User profile" },
  { value: "nickname", label: "Nickname", group: "User profile" },
  { value: "picture", label: "Picture", group: "User profile" },
  { value: "locale", label: "Locale", group: "User profile" },
  { value: "username", label: "Username", group: "User profile" },
  { value: "phone_number", label: "Phone number", group: "User profile" },
  { value: "connection", label: "Connection", group: "Authentication" },
  { value: "provider", label: "Provider", group: "Authentication" },
  { value: "is_social", label: "Is social", group: "Authentication" },
  { value: "user_id", label: "User ID", group: "Authentication" },
  { value: "user_metadata.country", label: "Country", group: "User metadata" },
  { value: "user_metadata.gender", label: "Gender", group: "User metadata" },
  {
    value: "user_metadata.birthdate",
    label: "Birthdate",
    group: "User metadata",
  },
  { value: "user_metadata.address", label: "Address", group: "User metadata" },
  { value: "user_metadata.phone", label: "Phone", group: "User metadata" },
];

export const COMPONENT_CATEGORIES = {
  CONTENT: "Content",
  FIELDS: "Input fields",
  ACTIONS: "Actions",
  BLOCKS: "Blocks",
  WIDGETS: "Widgets",
} as const;

export interface ComponentTypeOption {
  type: string;
  label: string;
  category: keyof typeof COMPONENT_CATEGORIES;
  bespoke: boolean;
}

export const COMPONENT_TYPE_OPTIONS: ComponentTypeOption[] = [
  { type: "RICH_TEXT", label: "Rich text", category: "CONTENT", bespoke: true },
  { type: "LEGAL", label: "Legal", category: "CONTENT", bespoke: true },
  { type: "TEXT", label: "Text", category: "FIELDS", bespoke: true },
  { type: "EMAIL", label: "Email", category: "FIELDS", bespoke: true },
  { type: "NUMBER", label: "Number", category: "FIELDS", bespoke: true },
  { type: "TEL", label: "Phone", category: "FIELDS", bespoke: true },
  { type: "URL", label: "URL", category: "FIELDS", bespoke: true },
  { type: "PASSWORD", label: "Password", category: "FIELDS", bespoke: true },
  { type: "DROPDOWN", label: "Dropdown", category: "FIELDS", bespoke: true },
  { type: "CHOICE", label: "Choice", category: "FIELDS", bespoke: true },
  { type: "DATE", label: "Date", category: "FIELDS", bespoke: true },
  { type: "CUSTOM", label: "Custom", category: "FIELDS", bespoke: true },
  { type: "BOOLEAN", label: "Boolean", category: "FIELDS", bespoke: false },
  { type: "COUNTRY", label: "Country", category: "FIELDS", bespoke: false },
  { type: "FILE", label: "File upload", category: "FIELDS", bespoke: false },
  { type: "PAYMENT", label: "Payment", category: "FIELDS", bespoke: false },
  { type: "SOCIAL", label: "Social", category: "FIELDS", bespoke: false },
  { type: "CARDS", label: "Cards", category: "FIELDS", bespoke: false },
  {
    type: "NEXT_BUTTON",
    label: "Next button",
    category: "ACTIONS",
    bespoke: true,
  },
  {
    type: "PREVIOUS_BUTTON",
    label: "Previous button",
    category: "ACTIONS",
    bespoke: false,
  },
  {
    type: "JUMP_BUTTON",
    label: "Jump button",
    category: "ACTIONS",
    bespoke: false,
  },
  {
    type: "RESEND_BUTTON",
    label: "Resend button",
    category: "ACTIONS",
    bespoke: false,
  },
  { type: "DIVIDER", label: "Divider", category: "BLOCKS", bespoke: false },
  { type: "HTML", label: "HTML block", category: "BLOCKS", bespoke: false },
  { type: "IMAGE", label: "Image", category: "BLOCKS", bespoke: false },
  {
    type: "AUTH0_VERIFIABLE_CREDENTIALS",
    label: "Verifiable credentials",
    category: "WIDGETS",
    bespoke: false,
  },
  {
    type: "GMAPS_ADDRESS",
    label: "Google Maps address",
    category: "WIDGETS",
    bespoke: false,
  },
  {
    type: "RECAPTCHA",
    label: "reCAPTCHA",
    category: "WIDGETS",
    bespoke: false,
  },
];

export const randomId = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 6)}${Math.random().toString(36).slice(2, 4)}`;
