import { useWatch } from "react-hook-form";
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
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RawJsonTab } from "@/common/RawJsonTab";

const shieldChoices = [
  { id: "block", name: "Block" },
  { id: "user_notification", name: "User notification" },
  { id: "admin_notification", name: "Admin notification" },
];

function SectionCard({
  title,
  description,
  enabledSource,
  children,
}: {
  title: string;
  description: string;
  enabledSource: string;
  children: React.ReactNode;
}) {
  const enabled = useWatch({ name: enabledSource }) as boolean | undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BooleanInput source={enabledSource} label="Enabled" />
        {enabled ? (
          <div className="flex flex-col gap-4 border-l-2 pl-4">{children}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BruteForceTab() {
  return (
    <SectionCard
      title="Brute-force protection"
      description="Throttle repeated failed logins for the same identifier. Locks the account temporarily and (optionally) notifies the user or admins."
      enabledSource="brute_force_protection.enabled"
    >
      <SelectInput
        source="brute_force_protection.mode"
        label="Mode"
        choices={[
          {
            id: "count_per_identifier_and_ip",
            name: "Per identifier and IP",
          },
          { id: "count_per_identifier", name: "Per identifier" },
        ]}
        helperText="Per-identifier counts together with IP triggers earlier on credential-stuffing; per-identifier alone is gentler on shared NAT."
      />
      <NumberInput
        source="brute_force_protection.max_attempts"
        label="Max attempts before block"
      />
      <ArrayInput
        source="brute_force_protection.shields"
        label="Shields"
        helperText="Actions to take when the threshold is hit."
      >
        <SimpleFormIterator inline>
          <SelectInput source="" label="" choices={shieldChoices} />
        </SimpleFormIterator>
      </ArrayInput>
      <ArrayInput
        source="brute_force_protection.allowlist"
        label="Allowlist"
        helperText="IPs (or CIDR ranges) exempt from brute-force throttling — useful for office NAT and test runners."
      >
        <SimpleFormIterator inline>
          <TextInput source="" label="" helperText="IP or CIDR" />
        </SimpleFormIterator>
      </ArrayInput>
    </SectionCard>
  );
}

function BreachedPasswordTab() {
  return (
    <SectionCard
      title="Breached password detection"
      description="Block or warn when a user attempts to authenticate with a password known to be exposed in a public breach."
      enabledSource="breached_password_detection.enabled"
    >
      <SelectInput
        source="breached_password_detection.method"
        label="Method"
        choices={[
          { id: "standard", name: "Standard" },
          { id: "enhanced", name: "Enhanced" },
        ]}
        helperText="Enhanced also checks email/IP combinations against breach corpora."
      />
      <ArrayInput
        source="breached_password_detection.shields"
        label="Shields"
        helperText="Actions to take on a breached password match."
      >
        <SimpleFormIterator inline>
          <SelectInput source="" label="" choices={shieldChoices} />
        </SimpleFormIterator>
      </ArrayInput>
    </SectionCard>
  );
}

function SuspiciousIpTab() {
  return (
    <SectionCard
      title="Suspicious IP throttling"
      description="Rate-limit logins and signups from individual IPs that look automated. Operates separately from brute-force protection."
      enabledSource="suspicious_ip_throttling.enabled"
    >
      <ArrayInput
        source="suspicious_ip_throttling.shields"
        label="Shields"
        helperText="Actions to take when the IP crosses a threshold."
      >
        <SimpleFormIterator inline>
          <SelectInput source="" label="" choices={shieldChoices} />
        </SimpleFormIterator>
      </ArrayInput>
      <ArrayInput
        source="suspicious_ip_throttling.allowlist"
        label="Allowlist"
        helperText="IPs or CIDR ranges that should never be throttled."
      >
        <SimpleFormIterator inline>
          <TextInput source="" label="" helperText="IP or CIDR" />
        </SimpleFormIterator>
      </ArrayInput>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="text-sm font-medium">Pre-login</div>
          <NumberInput
            source="suspicious_ip_throttling.stage.pre-login.max_attempts"
            label="Max attempts"
          />
          <NumberInput
            source="suspicious_ip_throttling.stage.pre-login.rate"
            label="Rate (ms)"
            helperText="Token refill rate in milliseconds."
          />
        </div>
        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="text-sm font-medium">Pre-user-registration</div>
          <NumberInput
            source="suspicious_ip_throttling.stage.pre-user-registration.max_attempts"
            label="Max attempts"
          />
          <NumberInput
            source="suspicious_ip_throttling.stage.pre-user-registration.rate"
            label="Rate (ms)"
            helperText="Token refill rate in milliseconds."
          />
        </div>
      </div>
    </SectionCard>
  );
}

export function AttackProtectionEdit() {
  return (
    <Edit mutationMode="pessimistic" redirect={false}>
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="brute-force" className="w-full">
          <TabsList>
            <TabsTrigger value="brute-force">Brute Force</TabsTrigger>
            <TabsTrigger value="breached-passwords">
              Breached Passwords
            </TabsTrigger>
            <TabsTrigger value="suspicious-ip">Suspicious IPs</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="brute-force" className="mt-4">
            <BruteForceTab />
          </TabsContent>
          <TabsContent value="breached-passwords" className="mt-4">
            <BreachedPasswordTab />
          </TabsContent>
          <TabsContent value="suspicious-ip" className="mt-4">
            <SuspiciousIpTab />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
