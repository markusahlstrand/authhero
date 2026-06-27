import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDataProvider } from "ra-core";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MembersTab } from "../organizations/tabs/members-tab";
import { findOrganizationForTenant } from "./orgLookup";
import {
  getClientIdFromStorage,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";

interface OrganizationRecord {
  id: string;
  name?: string;
  display_name?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; org: OrganizationRecord }
  | { status: "missing" }
  | { status: "error" };

/**
 * Control-plane view for managing who can access a child tenant.
 *
 * Each child tenant is mirrored by an organization on the control-plane tenant
 * where `organization.name === tenant.id`. Granting/removing access is done by
 * managing that organization's membership and roles, which this page does by
 * resolving the organization from the tenant id and reusing `<MembersTab />`.
 */
export function TenantMembers() {
  const { tenantId } = useParams();
  const dataProvider = useDataProvider();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // The invitation link is issued for the control-plane admin client so an
  // invited user can accept and sign in to the admin. Falls back to undefined,
  // which simply hides the invite UI (members can still be added directly).
  const inviteClientId =
    getClientIdFromStorage(getSelectedDomainFromStorage()) || undefined;

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setState({ status: "loading" });

    dataProvider
      .getList<OrganizationRecord>("organizations", {
        pagination: { page: 1, perPage: 100 },
        sort: { field: "name", order: "ASC" },
        filter: { q: tenantId },
      })
      .then(({ data }) => {
        if (cancelled) return;
        const org = findOrganizationForTenant(data, tenantId);
        setState(org ? { status: "ready", org } : { status: "missing" });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, dataProvider]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/tenants">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to tenants
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members of {tenantId}</CardTitle>
          <CardDescription>
            People with access to this tenant. Add or remove members and assign
            roles to control what they can do.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "loading" ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading members…</span>
            </div>
          ) : state.status === "ready" ? (
            <MembersTab
              organizationId={state.org.id}
              inviteClientId={inviteClientId}
            />
          ) : state.status === "missing" ? (
            <p className="py-8 text-sm text-muted-foreground">
              Team management isn&apos;t enabled for this tenant yet. No
              organization exists for it on the control plane.
            </p>
          ) : (
            <p className="py-8 text-sm text-destructive">
              Could not load members for this tenant. Check that you have access
              to manage it and try again.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
