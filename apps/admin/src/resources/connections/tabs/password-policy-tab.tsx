import {
  TextInput,
  BooleanInput,
  SelectInput,
  NumberInput,
  ArrayInput,
  SimpleFormIterator,
} from "@/components/admin";
import { useWatch } from "react-hook-form";
import { Separator } from "@/components/ui/separator";

function PasswordHistorySize() {
  const enabled = useWatch({ name: "options.password_history.enable" });
  if (!enabled) return null;
  return (
    <NumberInput
      source="options.password_history.size"
      label="Password History Size"
    />
  );
}

function PasswordDictionary() {
  const enabled = useWatch({ name: "options.password_dictionary.enable" });
  if (!enabled) return null;
  return (
    <ArrayInput
      source="options.password_dictionary.dictionary"
      label="Custom Password Dictionary"
    >
      <SimpleFormIterator>
        <TextInput source="" label="Dictionary Entry" />
      </SimpleFormIterator>
    </ArrayInput>
  );
}

export function PasswordPolicyTab() {
  return (
    <>
      <SelectInput
        source="options.passwordPolicy"
        label="Password Policy"
        choices={[
          { id: "none", name: "None" },
          { id: "low", name: "Low" },
          { id: "fair", name: "Fair" },
          { id: "good", name: "Good" },
          { id: "excellent", name: "Excellent" },
        ]}
      />
      <NumberInput
        source="options.password_complexity_options.min_length"
        label="Minimum Password Length"
      />

      <Separator className="my-4" />

      <BooleanInput
        source="options.password_history.enable"
        label="Enable Password History"
      />
      <PasswordHistorySize />
      <BooleanInput
        source="options.password_no_personal_info.enable"
        label="No Personal Info in Passwords"
      />
      <BooleanInput
        source="options.password_dictionary.enable"
        label="Enable Password Dictionary"
      />
      <PasswordDictionary />
    </>
  );
}
