import { useEffect, useMemo, useState } from "react";
import { Resource, CustomRoutes } from "ra-core";
import { Route } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cloud,
  Code,
  Database,
  KeyRound,
  Layers,
  Layout,
  Mail,
  Palette,
  PlayCircle,
  Rss,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Type,
  UserCog,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { Admin } from "@/components/admin";
import { getAuthProvider } from "./authProvider";
import { getDataproviderForTenant } from "./dataProvider";
import { getConfigValue } from "./utils/runtimeConfig";
import { buildUrlWithProtocol } from "./utils/domainUtils";
import { TenantProvider } from "./TenantContext";
import { CertificateErrorDialog } from "./components/CertificateErrorDialog";

import { ClientList, ClientCreate, ClientEdit } from "./resources/clients";
import {
  ConnectionsList,
  ConnectionCreate,
  ConnectionEdit,
} from "./resources/connections";
import { UsersList, UserCreate, UserEdit } from "./resources/users";
import {
  DomainList,
  DomainCreate,
  DomainEdit,
} from "./resources/custom-domains";
import { ActionList, ActionCreate, ActionEdit } from "./resources/actions";
import { ActionExecutionShow } from "./resources/action-executions";
import { ActionTriggersList } from "./resources/action-triggers";
import { HookList, HooksCreate, HookEdit } from "./resources/hooks";
import { LogsList, LogShow } from "./resources/logs";
import {
  LogStreamsList,
  LogStreamCreate,
  LogStreamEdit,
} from "./resources/log-streams";
import { SessionEdit, SessionShow } from "./resources/sessions";
import { FormsList, FormCreate, FormEdit } from "./resources/forms";
import { FlowsList, FlowCreate, FlowEdit } from "./resources/flows";
import { BrandingList, BrandingEdit } from "./resources/branding";
import { PromptsList, PromptsEdit } from "./resources/prompts";
import {
  ResourceServerList,
  ResourceServerCreate,
  ResourceServerEdit,
} from "./resources/resource-servers";
import { ScopeCreate, ScopeEdit } from "./resources/resource-server-scopes";
import {
  OrganizationList,
  OrganizationCreate,
  OrganizationEdit,
} from "./resources/organizations";
import {
  AttackProtectionList,
  AttackProtectionEdit,
} from "./resources/attack-protection";
import { MfaList, MfaEdit } from "./resources/mfa";
import { SigningKeysList } from "./resources/signing-keys";
import {
  EmailProvidersList,
  EmailProvidersEdit,
} from "./resources/email-providers";
import {
  EmailTemplatesList,
  EmailTemplatesEdit,
} from "./resources/email-templates";
import { SettingsList, SettingsEdit } from "./resources/settings";
import { RoleList, RoleCreate, RoleEdit } from "./resources/roles";
import { Dashboard } from "./resources/dashboard/Dashboard";
import { AnalyticsPage } from "./resources/analytics/AnalyticsPage";

interface AppProps {
  tenantId: string;
  initialDomain?: string;
  onAuthComplete?: () => void;
}

export function App({ tenantId, initialDomain, onAuthComplete }: AppProps) {
  const [certErrorUrl, setCertErrorUrl] = useState<string | null>(null);
  const selectedDomain = initialDomain || getConfigValue("domain") || "";

  const storedFlag = sessionStorage.getItem("isSingleTenant");
  const sepIdx = storedFlag?.lastIndexOf("|") ?? -1;
  const storedDomain = sepIdx > -1 ? storedFlag!.substring(0, sepIdx) : null;
  const storedValue =
    sepIdx > -1 ? storedFlag!.substring(sepIdx + 1) : storedFlag;
  const [isSingleTenantChecked, setIsSingleTenantChecked] = useState<boolean>(
    storedDomain === selectedDomain && storedValue !== null,
  );

  useEffect(() => {
    if (isSingleTenantChecked || !selectedDomain) return;
    const checkSingleTenant = async () => {
      const apiUrl = buildUrlWithProtocol(selectedDomain);
      try {
        const response = await fetch(`${apiUrl}/api/v2/tenants?per_page=1`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        sessionStorage.setItem(
          "isSingleTenant",
          `${selectedDomain}|${response.status === 404}`,
        );
      } catch {
        sessionStorage.setItem("isSingleTenant", `${selectedDomain}|true`);
      }
      setIsSingleTenantChecked(true);
    };
    checkSingleTenant();
  }, [selectedDomain, isSingleTenantChecked]);

  const authProvider = useMemo(() => {
    if (!selectedDomain) return null;
    return getAuthProvider(selectedDomain, onAuthComplete);
  }, [selectedDomain, onAuthComplete]);

  const dataProvider = useMemo(() => {
    const baseProvider = getDataproviderForTenant(tenantId, selectedDomain);
    const wrapped = {} as typeof baseProvider;
    for (const method of Object.keys(baseProvider) as Array<
      keyof typeof baseProvider
    >) {
      const original = baseProvider[method];
      if (typeof original === "function") {
        (wrapped as Record<string, unknown>)[method] = async (
          ...args: unknown[]
        ) => {
          try {
            return await (original as Function).apply(baseProvider, args);
          } catch (error) {
            const e = error as {
              isCertificateError?: boolean;
              serverUrl?: string;
            };
            if (e?.isCertificateError && e?.serverUrl) {
              setCertErrorUrl(e.serverUrl);
            }
            throw error;
          }
        };
      }
    }
    return wrapped;
  }, [tenantId, selectedDomain, isSingleTenantChecked]);

  if (!isSingleTenantChecked) {
    return <div className="p-4">Checking tenant mode…</div>;
  }
  if (!authProvider || !selectedDomain) {
    return <div className="p-4">Loading…</div>;
  }

  return (
    <TenantProvider tenantId={tenantId}>
      <CertificateErrorDialog
        open={!!certErrorUrl}
        serverUrl={certErrorUrl || ""}
        onClose={() => setCertErrorUrl(null)}
      />
      <Admin
        dataProvider={dataProvider}
        authProvider={authProvider}
        dashboard={Dashboard}
        requireAuth={!!selectedDomain}
      >
        <CustomRoutes>
          <Route path="/activity" element={<Dashboard />} />
          <Route
            path="/resource-servers/:id/scopes/create"
            element={<ScopeCreate />}
          />
          <Route
            path="/resource-servers/:id/scopes/:scopeId/edit"
            element={<ScopeEdit />}
          />
        </CustomRoutes>

        <Resource
          name="analytics"
          icon={BarChart3}
          list={AnalyticsPage}
          options={{ label: "Analytics", menuGroup: "Observability" }}
        />
        <Resource
          name="clients"
          icon={Database}
          list={ClientList}
          create={ClientCreate}
          edit={ClientEdit}
          options={{ label: "Applications", menuGroup: "Applications" }}
        />
        <Resource
          name="connections"
          icon={Cloud}
          list={ConnectionsList}
          create={ConnectionCreate}
          edit={ConnectionEdit}
          options={{ menuGroup: "Applications" }}
        />
        <Resource
          name="users"
          icon={Users}
          list={UsersList}
          create={UserCreate}
          edit={UserEdit}
          options={{ menuGroup: "Identity" }}
        />
        <Resource
          name="custom-domains"
          icon={Layers}
          list={DomainList}
          create={DomainCreate}
          edit={DomainEdit}
          recordRepresentation={(record) =>
            record?.domain || record?.custom_domain_id || ""
          }
          options={{ menuGroup: "Applications" }}
        />
        <Resource
          name="actions"
          icon={Code}
          list={ActionList}
          create={ActionCreate}
          edit={ActionEdit}
          options={{ label: "Actions", menuGroup: "Developer" }}
        />
        <Resource
          name="action-triggers"
          icon={PlayCircle}
          list={ActionTriggersList}
          options={{ label: "Triggers", menuGroup: "Developer" }}
        />
        <Resource
          name="hooks"
          icon={Webhook}
          list={HookList}
          create={HooksCreate}
          edit={HookEdit}
          options={{ menuGroup: "Developer" }}
        />
        <Resource
          name="logs"
          icon={ScrollText}
          list={LogsList}
          show={LogShow}
          recordRepresentation={(record) =>
            record?.description || record?.type || `Log ${record?.id ?? ""}`
          }
          options={{ menuGroup: "Observability" }}
        />
        <Resource
          name="log-streams"
          icon={Rss}
          list={LogStreamsList}
          create={LogStreamCreate}
          edit={LogStreamEdit}
          options={{ label: "Log Streams", menuGroup: "Observability" }}
        />
        <Resource name="sessions" edit={SessionEdit} show={SessionShow} />
        <Resource name="action-executions" show={ActionExecutionShow} />
        <Resource
          name="forms"
          icon={Layout}
          list={FormsList}
          create={FormCreate}
          edit={FormEdit}
          options={{ menuGroup: "Branding" }}
        />
        <Resource
          name="flows"
          icon={Workflow}
          list={FlowsList}
          create={FlowCreate}
          edit={FlowEdit}
          options={{ label: "Form Flows", menuGroup: "Branding" }}
        />
        <Resource
          name="branding"
          icon={Palette}
          options={{ hasSingle: true, menuGroup: "Branding" }}
          list={BrandingList}
          edit={BrandingEdit}
        />
        <Resource
          name="prompts"
          icon={Type}
          options={{ hasSingle: true, menuGroup: "Branding" }}
          list={PromptsList}
          edit={PromptsEdit}
        />
        <Resource
          name="resource-servers"
          icon={Activity}
          list={ResourceServerList}
          create={ResourceServerCreate}
          edit={ResourceServerEdit}
          options={{ label: "APIs", menuGroup: "Applications" }}
        />
        <Resource name="resource-server-scopes" />
        <Resource name="permissions" />
        <Resource name="client-grants" />
        <Resource
          name="roles"
          icon={Shield}
          list={RoleList}
          create={RoleCreate}
          edit={RoleEdit}
          options={{ menuGroup: "Identity" }}
        />
        <Resource
          name="organizations"
          icon={UserCog}
          list={OrganizationList}
          create={OrganizationCreate}
          edit={OrganizationEdit}
          options={{ menuGroup: "Identity" }}
        />
        <Resource
          name="attack-protection"
          icon={AlertTriangle}
          list={AttackProtectionList}
          edit={AttackProtectionEdit}
          options={{
            hasSingle: true,
            label: "Attack Protection",
            menuGroup: "Security",
          }}
        />
        <Resource
          name="mfa"
          icon={ShieldCheck}
          list={MfaList}
          edit={MfaEdit}
          options={{ hasSingle: true, label: "MFA", menuGroup: "Security" }}
        />
        <Resource
          name="signing-keys"
          icon={KeyRound}
          list={SigningKeysList}
          options={{ label: "Signing Keys", menuGroup: "Developer" }}
        />
        <Resource
          name="email-providers"
          icon={Mail}
          list={EmailProvidersList}
          edit={EmailProvidersEdit}
          options={{
            hasSingle: true,
            label: "Email Provider",
            menuGroup: "Branding",
          }}
        />
        <Resource
          name="email-templates"
          icon={Mail}
          list={EmailTemplatesList}
          edit={EmailTemplatesEdit}
          options={{
            label: "Email Templates",
            menuGroup: "Branding",
          }}
        />
        <Resource
          name="settings"
          icon={Settings}
          list={SettingsList}
          edit={SettingsEdit}
          options={{ hasSingle: true, menuGroup: "Settings" }}
        />
      </Admin>
    </TenantProvider>
  );
}
