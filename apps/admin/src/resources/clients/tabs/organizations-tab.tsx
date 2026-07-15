import { SelectInput } from "@/components/admin";

const ORGANIZATION_USAGE_CHOICES = [
  { id: "deny", name: "Deny (default) — no organization context" },
  { id: "allow", name: "Allow — organization context is optional" },
  { id: "require", name: "Require — organization context is mandatory" },
];

const ORGANIZATION_REQUIRE_BEHAVIOR_CHOICES = [
  { id: "no_prompt", name: "No prompt" },
  { id: "pre_login_prompt", name: "Pre-login prompt" },
  { id: "post_login_prompt", name: "Post-login prompt (requires OIDC Conformant)" },
];

export function OrganizationsTab() {
  return (
    <>
      <p className="text-sm text-muted-foreground mb-2">
        Control whether this application authenticates users in the context of
        an organization. <code>Allow</code> or <code>Require</code> is needed
        for org-scoped token exchanges — a client left at <code>Deny</code> is
        rejected with <code>unauthorized_client</code> when requesting
        organization context.
      </p>
      <SelectInput
        source="organization_usage"
        label="Type of Users"
        choices={ORGANIZATION_USAGE_CHOICES}
        helperText="Defines how to proceed during an authentication transaction with regards to an organization."
      />
      <SelectInput
        source="organization_require_behavior"
        label="Login Flow"
        choices={ORGANIZATION_REQUIRE_BEHAVIOR_CHOICES}
        helperText="Only applies when Type of Users is 'Require'. Determines how the user is prompted for an organization. 'Post-login prompt' requires OIDC Conformant to be enabled on the Advanced tab."
      />
    </>
  );
}
