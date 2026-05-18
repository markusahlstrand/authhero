import {
  BooleanInput,
  SelectInput,
  NumberInput,
} from "@/components/admin";
import { useWatch } from "react-hook-form";
import { Separator } from "@/components/ui/separator";

function UsernameOptions() {
  const usernameActive = useWatch({
    name: "options.attributes.username.identifier.active",
  });
  if (!usernameActive) return null;
  return (
    <>
      <SelectInput
        source="options.attributes.username.signup.status"
        label="Signup Status"
        helperText="Whether username is required or optional during sign up"
        defaultValue="required"
        choices={[
          { id: "required", name: "Required" },
          { id: "optional", name: "Optional" },
          { id: "disabled", name: "Disabled" },
        ]}
      />
      <NumberInput
        source="options.attributes.username.validation.min_length"
        label="Minimum Length"
        defaultValue={1}
        min={1}
      />
      <NumberInput
        source="options.attributes.username.validation.max_length"
        label="Maximum Length"
        defaultValue={15}
        min={1}
      />
      <BooleanInput
        source="options.attributes.username.validation.allowed_types.email"
        label="Allow Email as Username"
        helperText="Allow users to use an email address as their username"
      />
      <BooleanInput
        source="options.attributes.username.validation.allowed_types.phone_number"
        label="Allow Phone Number as Username"
        helperText="Allow users to use a phone number as their username"
      />
    </>
  );
}

function PhoneNumberOptions() {
  const phoneActive = useWatch({
    name: "options.attributes.phone_number.identifier.active",
  });
  if (!phoneActive) return null;
  return (
    <SelectInput
      source="options.attributes.phone_number.signup.status"
      label="Signup Status"
      defaultValue="optional"
      choices={[
        { id: "required", name: "Required" },
        { id: "optional", name: "Optional" },
        { id: "disabled", name: "Disabled" },
      ]}
    />
  );
}

export function AttributesTab() {
  return (
    <>
      <h3 className="text-base font-semibold mt-2 mb-2">Email</h3>
      <BooleanInput
        source="options.attributes.email.identifier.active"
        label="Use as Identifier"
        helperText="Allow users to identify with their email address"
        defaultValue={true}
      />
      <SelectInput
        source="options.attributes.email.signup.status"
        label="Signup Status"
        helperText="Whether email is required, optional or disabled during sign up"
        defaultValue="required"
        choices={[
          { id: "required", name: "Required" },
          { id: "optional", name: "Optional" },
          { id: "disabled", name: "Disabled" },
        ]}
      />
      <BooleanInput
        source="options.attributes.email.signup.verification.active"
        label="Email Verification"
        helperText="Require email verification after signup"
        defaultValue={true}
      />
      <SelectInput
        source="options.attributes.email.verification_method"
        label="Verification Method"
        defaultValue="link"
        choices={[
          { id: "link", name: "Link" },
          { id: "code", name: "Code" },
        ]}
      />

      <Separator className="my-4" />

      <h3 className="text-base font-semibold mt-2 mb-2">Username</h3>
      <BooleanInput
        source="options.attributes.username.identifier.active"
        label="Use as Identifier"
        helperText="Allow users to identify with a username"
      />
      <UsernameOptions />

      <Separator className="my-4" />

      <h3 className="text-base font-semibold mt-2 mb-2">Phone Number</h3>
      <BooleanInput
        source="options.attributes.phone_number.identifier.active"
        label="Use as Identifier"
        helperText="Allow users to identify with a phone number"
      />
      <PhoneNumberOptions />
    </>
  );
}
