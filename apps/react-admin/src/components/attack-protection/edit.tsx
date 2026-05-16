import {
  Edit,
  TabbedForm,
  BooleanInput,
  NumberInput,
  TextInput,
  SelectInput,
  ArrayInput,
  SimpleFormIterator,
} from "react-admin";
import { Stack } from "@mui/material";

const shieldChoices = [
  { id: "block", name: "Block" },
  { id: "user_notification", name: "User Notification" },
  { id: "admin_notification", name: "Admin Notification" },
];

export function AttackProtectionEdit({ id }: { id?: string } = {}) {
  return (
    <Edit id={id} resource="attack-protection">
      <TabbedForm>
        <TabbedForm.Tab label="Brute-force Protection">
          <Stack spacing={2}>
            <BooleanInput
              source="brute_force_protection.enabled"
              label="Enabled"
            />
            <SelectInput
              source="brute_force_protection.mode"
              label="Mode"
              choices={[
                {
                  id: "count_per_identifier_and_ip",
                  name: "Count per identifier and IP",
                },
                {
                  id: "count_per_identifier",
                  name: "Count per identifier",
                },
              ]}
              fullWidth
            />
            <NumberInput
              source="brute_force_protection.max_attempts"
              label="Max attempts"
              helperText="Failed login attempts before block kicks in"
            />
            <ArrayInput source="brute_force_protection.shields" label="Shields">
              <SimpleFormIterator inline>
                <SelectInput source="" label="" choices={shieldChoices} />
              </SimpleFormIterator>
            </ArrayInput>
            <ArrayInput
              source="brute_force_protection.allowlist"
              label="IP Allowlist"
            >
              <SimpleFormIterator inline>
                <TextInput source="" label="" helperText="IP or CIDR" />
              </SimpleFormIterator>
            </ArrayInput>
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Breached Password Detection">
          <Stack spacing={2}>
            <BooleanInput
              source="breached_password_detection.enabled"
              label="Enabled"
            />
            <SelectInput
              source="breached_password_detection.method"
              label="Detection method"
              choices={[
                { id: "standard", name: "Standard" },
                { id: "enhanced", name: "Enhanced" },
              ]}
              fullWidth
            />
            <ArrayInput
              source="breached_password_detection.shields"
              label="Shields"
            >
              <SimpleFormIterator inline>
                <SelectInput source="" label="" choices={shieldChoices} />
              </SimpleFormIterator>
            </ArrayInput>
            <ArrayInput
              source="breached_password_detection.admin_notification_frequency"
              label="Admin notification frequency"
            >
              <SimpleFormIterator inline>
                <SelectInput
                  source=""
                  label=""
                  choices={[
                    { id: "immediately", name: "Immediately" },
                    { id: "daily", name: "Daily" },
                    { id: "weekly", name: "Weekly" },
                    { id: "monthly", name: "Monthly" },
                  ]}
                />
              </SimpleFormIterator>
            </ArrayInput>
            <ArrayInput
              source="breached_password_detection.stage.pre-user-registration.shields"
              label="Pre-user-registration shields"
            >
              <SimpleFormIterator inline>
                <SelectInput source="" label="" choices={shieldChoices} />
              </SimpleFormIterator>
            </ArrayInput>
            <ArrayInput
              source="breached_password_detection.stage.pre-change-password.shields"
              label="Pre-change-password shields"
            >
              <SimpleFormIterator inline>
                <SelectInput source="" label="" choices={shieldChoices} />
              </SimpleFormIterator>
            </ArrayInput>
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Suspicious IP Throttling">
          <Stack spacing={2}>
            <BooleanInput
              source="suspicious_ip_throttling.enabled"
              label="Enabled"
            />
            <ArrayInput
              source="suspicious_ip_throttling.shields"
              label="Shields"
            >
              <SimpleFormIterator inline>
                <SelectInput source="" label="" choices={shieldChoices} />
              </SimpleFormIterator>
            </ArrayInput>
            <ArrayInput
              source="suspicious_ip_throttling.allowlist"
              label="IP allowlist"
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
              label="Pre-login rate (ms between attempts)"
            />
            <NumberInput
              source="suspicious_ip_throttling.stage.pre-user-registration.max_attempts"
              label="Pre-user-registration max attempts"
            />
            <NumberInput
              source="suspicious_ip_throttling.stage.pre-user-registration.rate"
              label="Pre-user-registration rate (ms between attempts)"
            />
          </Stack>
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
