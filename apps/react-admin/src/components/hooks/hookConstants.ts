/**
 * Centralized hook metadata: templates, triggers, and helper functions.
 *
 * Both the Create and Edit views import from here so that names,
 * descriptions, and trigger mappings stay in sync.
 */

export interface HookTemplateMeta {
    name: string;
    description: string;
    trigger_id: string;
}

/**
 * Registry of available hook templates.
 * Each template maps to a pre-defined hook function on the server side.
 */
export const hookTemplates: Record<string, HookTemplateMeta> = {
    "ensure-username": {
        name: "Ensure Username",
        description:
            "Automatically assigns a username to users who sign in without one",
        trigger_id: "post-user-login",
    },
    "set-preferred-username": {
        name: "Set Preferred Username",
        description:
            "Sets the preferred_username claim on tokens based on the username from the primary or linked user",
        trigger_id: "credentials-exchange",
    },
};

/** All trigger IDs that have at least one template. */
export const triggerIdsWithTemplates = new Set(
    Object.values(hookTemplates).map((t) => t.trigger_id),
);

/** Build template choices, optionally filtered by trigger_id. */
export function getTemplateChoicesForTrigger(triggerId?: string) {
    return Object.entries(hookTemplates)
        .filter(([, meta]) => !triggerId || meta.trigger_id === triggerId)
        .map(([id, meta]) => ({
            id,
            name: `${meta.name} — ${meta.description}`,
        }));
}

/** All supported trigger types for hooks. */
export const triggerChoices = [
    {
        id: "validate-registration-username",
        name: "Validate Registration Username",
    },
    { id: "pre-user-registration", name: "Pre User Registration" },
    { id: "post-user-registration", name: "Post User Registration" },
    { id: "post-user-login", name: "Post User Login" },
    { id: "credentials-exchange", name: "Credentials Exchange" },
    { id: "pre-user-update", name: "Pre User Update" },
    { id: "pre-user-deletion", name: "Pre User Deletion" },
    { id: "post-user-deletion", name: "Post User Deletion" },
];

/** Trigger choices narrowed to only those that have templates. */
export const triggerChoicesWithTemplatesOnly = triggerChoices.filter((c) =>
    triggerIdsWithTemplates.has(c.id),
);
