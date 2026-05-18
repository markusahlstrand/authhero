import { Edit, SimpleForm } from "@/components/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "./tabs/general-tab";
import { SessionTab } from "./tabs/session-tab";
import { SessionsManagementTab } from "./tabs/sessions-management-tab";
import { LocalizationTab } from "./tabs/localization-tab";
import { ErrorPageTab } from "./tabs/error-page-tab";
import { ChangePasswordTab } from "./tabs/change-password-tab";
import { GuardianMfaTab } from "./tabs/guardian-mfa-tab";
import { MfaFactorsTab } from "./tabs/mfa-factors-tab";
import { SmsProviderTab } from "./tabs/sms-provider-tab";
import { FeatureFlagsTab } from "./tabs/feature-flags-tab";
import { AdvancedTab } from "./tabs/advanced-tab";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeNullValues(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (isPlainObject(value)) {
      const cleaned = removeNullValues(value);
      if (Object.keys(cleaned).length > 0) result[key] = cleaned;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function SettingsEdit() {
  return (
    <Edit
      mutationMode="pessimistic"
      redirect={false}
      transform={removeNullValues as never}
    >
      <SimpleForm className="max-w-none">
        <Tabs defaultValue="general" className="w-full">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="session">Session</TabsTrigger>
            <TabsTrigger value="sessions-management">
              Sessions Management
            </TabsTrigger>
            <TabsTrigger value="localization">Localization</TabsTrigger>
            <TabsTrigger value="error-page">Error Page</TabsTrigger>
            <TabsTrigger value="change-password">Change Password</TabsTrigger>
            <TabsTrigger value="guardian-mfa">Guardian MFA</TabsTrigger>
            <TabsTrigger value="mfa-factors">MFA Factors</TabsTrigger>
            <TabsTrigger value="sms-provider">SMS Provider</TabsTrigger>
            <TabsTrigger value="feature-flags">Feature Flags</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="mt-4">
            <GeneralTab />
          </TabsContent>
          <TabsContent value="session" className="mt-4">
            <SessionTab />
          </TabsContent>
          <TabsContent value="sessions-management" className="mt-4">
            <SessionsManagementTab />
          </TabsContent>
          <TabsContent value="localization" className="mt-4">
            <LocalizationTab />
          </TabsContent>
          <TabsContent value="error-page" className="mt-4">
            <ErrorPageTab />
          </TabsContent>
          <TabsContent value="change-password" className="mt-4">
            <ChangePasswordTab />
          </TabsContent>
          <TabsContent value="guardian-mfa" className="mt-4">
            <GuardianMfaTab />
          </TabsContent>
          <TabsContent value="mfa-factors" className="mt-4">
            <MfaFactorsTab />
          </TabsContent>
          <TabsContent value="sms-provider" className="mt-4">
            <SmsProviderTab />
          </TabsContent>
          <TabsContent value="feature-flags" className="mt-4">
            <FeatureFlagsTab />
          </TabsContent>
          <TabsContent value="advanced" className="mt-4">
            <AdvancedTab />
          </TabsContent>
        </Tabs>
      </SimpleForm>
    </Edit>
  );
}
