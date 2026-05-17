import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  NumberInput,
  ArrayInput,
  SimpleFormIterator,
} from "@/components/admin";

const shieldChoices = [
  { id: "block", name: "Block" },
  { id: "user_notification", name: "User notification" },
  { id: "admin_notification", name: "Admin notification" },
];

export function AttackProtectionEdit() {
  return (
    <Edit mutationMode="pessimistic" redirect={false}>
      <SimpleForm>
        <h3 className="text-lg font-semibold mt-2">Brute-force Protection</h3>
        <BooleanInput source="brute_force_protection.enabled" label="Enabled" />
        <SelectInput
          source="brute_force_protection.mode"
          label="Mode"
          choices={[
            { id: "count_per_identifier_and_ip", name: "Per identifier and IP" },
            { id: "count_per_identifier", name: "Per identifier" },
          ]}
        />
        <NumberInput source="brute_force_protection.max_attempts" label="Max attempts" />
        <ArrayInput source="brute_force_protection.shields" label="Shields">
          <SimpleFormIterator inline>
            <SelectInput source="" label="" choices={shieldChoices} />
          </SimpleFormIterator>
        </ArrayInput>
        <ArrayInput source="brute_force_protection.allowlist" label="Allowlist">
          <SimpleFormIterator inline>
            <TextInput source="" label="" helperText="IP or CIDR" />
          </SimpleFormIterator>
        </ArrayInput>

        <h3 className="text-lg font-semibold mt-4">Breached Password Detection</h3>
        <BooleanInput
          source="breached_password_detection.enabled"
          label="Enabled"
        />
        <SelectInput
          source="breached_password_detection.method"
          label="Method"
          choices={[
            { id: "standard", name: "Standard" },
            { id: "enhanced", name: "Enhanced" },
          ]}
        />
        <ArrayInput source="breached_password_detection.shields" label="Shields">
          <SimpleFormIterator inline>
            <SelectInput source="" label="" choices={shieldChoices} />
          </SimpleFormIterator>
        </ArrayInput>

        <h3 className="text-lg font-semibold mt-4">Suspicious IP Throttling</h3>
        <BooleanInput
          source="suspicious_ip_throttling.enabled"
          label="Enabled"
        />
        <ArrayInput source="suspicious_ip_throttling.shields" label="Shields">
          <SimpleFormIterator inline>
            <SelectInput source="" label="" choices={shieldChoices} />
          </SimpleFormIterator>
        </ArrayInput>
        <ArrayInput
          source="suspicious_ip_throttling.allowlist"
          label="Allowlist"
        >
          <SimpleFormIterator inline>
            <TextInput source="" label="" helperText="IP or CIDR" />
          </SimpleFormIterator>
        </ArrayInput>
        <NumberInput
          source="suspicious_ip_throttling.stage.pre-login.max_attempts"
          label="Pre-login max attempts"
        />
        <NumberInput
          source="suspicious_ip_throttling.stage.pre-login.rate"
          label="Pre-login rate"
        />
        <NumberInput
          source="suspicious_ip_throttling.stage.pre-user-registration.max_attempts"
          label="Pre-user-registration max attempts"
        />
        <NumberInput
          source="suspicious_ip_throttling.stage.pre-user-registration.rate"
          label="Pre-user-registration rate"
        />
      </SimpleForm>
    </Edit>
  );
}
