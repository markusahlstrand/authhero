import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import {
  Invite,
  InviteInsert,
  OrganizationInsert,
} from "@authhero/adapter-interfaces";

describe("organization invitations management API endpoint", () => {
  async function createTestOrganization() {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const organizationData: OrganizationInsert = {
      name: "Test Organization",
      display_name: "Test Organization Display Name",
    };

    const createOrgResponse = await managementClient.organizations.$post(
      {
        json: organizationData,
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(createOrgResponse.status).toBe(201);
    const org = await createOrgResponse.json();
    return {
      organizationId: org.id,
      managementApp,
      env,
      token,
      managementClient,
    };
  }

  describe("POST /organizations/:id/invitations", () => {
    it("should create a new invitation", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      const invitationData: InviteInsert = {
        inviter: {
          name: "John Inviter",
        },
        invitee: {
          email: "invitee@example.com",
        },
        client_id: "client123",
        ttl_sec: 86400,
      };

      const response = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: organizationId },
          json: invitationData,
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(201);
      const invitation = await response.json();

      expect(invitation.id).toBeDefined();
      expect(invitation.id).toMatch(/^inv_/);
      expect(invitation.organization_id).toBe(organizationId);
      expect(invitation.inviter.name).toBe("John Inviter");
      expect(invitation.invitee.email).toBe("invitee@example.com");
      expect(invitation.client_id).toBe("client123");
      expect(invitation.ttl_sec).toBe(86400);
      expect(invitation.invitation_url).toBeDefined();
      expect(invitation.created_at).toBeDefined();
      expect(invitation.expires_at).toBeDefined();
    });

    it("should create an invitation with minimal data", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      const invitationData: InviteInsert = {
        inviter: {
          name: "Jane Smith",
        },
        invitee: {
          email: "minimal@example.com",
        },
        client_id: "client_abc",
      };

      const createResponse = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: organizationId },
          json: invitationData,
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createResponse.status).toBe(201);
      const invitation = await createResponse.json();

      expect(invitation.id).toBeDefined();
      expect(invitation.organization_id).toBe(organizationId);
      expect(invitation.ttl_sec).toBe(604800); // Default 7 days
      expect(invitation.send_invitation_email).toBe(true);
      expect(invitation.roles).toEqual([]);
    });

    it("should return 404 when creating invitation for non-existent organization", async () => {
      const { managementClient, token } = await createTestOrganization();

      const invitationData: InviteInsert = {
        inviter: { name: "Test" },
        invitee: { email: "test@example.com" },
        client_id: "client_123",
      };

      const createResponse = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: "org_nonexistent" },
          json: invitationData,
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createResponse.status).toBe(404);
    });

    it("should require authentication", async () => {
      const { managementClient } = await createTestOrganization();

      const invitationData: InviteInsert = {
        inviter: { name: "Test" },
        invitee: { email: "test@example.com" },
        client_id: "client_123",
      };

      const createResponse = await managementClient.organizations[
        ":id"
      ].invitations.$post({
        param: { id: "org_test" },
        json: invitationData,
        header: {
          "tenant-id": "tenantId",
        },
      });

      expect(createResponse.status).toBe(401);
    });
  });

  describe("GET /organizations/:id/invitations", () => {
    it("should list all invitations for an organization", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      // Create two invitations
      const invitation1: InviteInsert = {
        inviter: { name: "Inviter 1" },
        invitee: { email: "user1@example.com" },
        client_id: "client_1",
      };

      const invitation2: InviteInsert = {
        inviter: { name: "Inviter 2" },
        invitee: { email: "user2@example.com" },
        client_id: "client_2",
      };

      await managementClient.organizations[":id"].invitations.$post(
        {
          param: { id: organizationId },
          json: invitation1,
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      await managementClient.organizations[":id"].invitations.$post(
        {
          param: { id: organizationId },
          json: invitation2,
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      // List invitations
      const listResponse = await managementClient.organizations[
        ":id"
      ].invitations.$get(
        {
          param: { id: organizationId },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(listResponse.status).toBe(200);
      const invitations = await listResponse.json();

      expect(Array.isArray(invitations)).toBe(true);
      expect(invitations.length).toBe(2);
      expect(invitations[0]?.organization_id).toBe(organizationId);
      expect(invitations[1]?.organization_id).toBe(organizationId);
    });

    it("should return empty array for organization with no invitations", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      const listResponse = await managementClient.organizations[
        ":id"
      ].invitations.$get(
        {
          param: { id: organizationId },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(listResponse.status).toBe(200);
      const invitations = await listResponse.json();

      expect(Array.isArray(invitations)).toBe(true);
      expect(invitations.length).toBe(0);
    });

    it("should support pagination", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      // Create 3 invitations
      for (let i = 1; i <= 3; i++) {
        await managementClient.organizations[":id"].invitations.$post(
          {
            param: { id: organizationId },
            json: {
              inviter: { name: `Inviter ${i}` },
              invitee: { email: `user${i}@example.com` },
              client_id: "client_123",
            },
            header: { "tenant-id": "tenantId" },
          },
          {
            headers: { authorization: `Bearer ${token}` },
          },
        );
      }

      // Get first page
      const page1Response = await managementClient.organizations[
        ":id"
      ].invitations.$get(
        {
          param: { id: organizationId },
          query: { per_page: "2", page: "1" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(page1Response.status).toBe(200);
      const page1 = await page1Response.json();
      expect(page1.length).toBe(2);

      // Get second page
      const page2Response = await managementClient.organizations[
        ":id"
      ].invitations.$get(
        {
          param: { id: organizationId },
          query: { per_page: "2", page: "2" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(page2Response.status).toBe(200);
      const page2 = await page2Response.json();
      expect(page2.length).toBe(1);
    });

    it("should return 404 for non-existent organization", async () => {
      const { managementClient, token } = await createTestOrganization();

      const listResponse = await managementClient.organizations[
        ":id"
      ].invitations.$get(
        {
          param: { id: "org_nonexistent" },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(listResponse.status).toBe(404);
    });
  });

  describe("GET /organizations/:id/invitations/:invitation_id", () => {
    it("should get a specific invitation", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      // Create an invitation
      const createResponse = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: organizationId },
          json: {
            inviter: { name: "Test Inviter" },
            invitee: { email: "test@example.com" },
            client_id: "client_123",
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      const created = await createResponse.json();

      // Get the invitation
      const getResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$get(
        {
          param: {
            id: organizationId,
            invitation_id: created.id,
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(getResponse.status).toBe(200);
      const invitation = (await getResponse.json()) as Invite;

      expect(invitation.id).toBe(created.id);
      expect(invitation.organization_id).toBe(organizationId);
      expect(invitation.inviter.name).toBe("Test Inviter");
      expect(invitation.invitee.email).toBe("test@example.com");
    });

    it("should return 404 for non-existent invitation", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      const getResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$get(
        {
          param: {
            id: organizationId,
            invitation_id: "inv_nonexistent",
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(getResponse.status).toBe(404);
    });

    it("should return 404 when invitation belongs to different organization", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      // Create a second organization
      const org2Response = await managementClient.organizations.$post(
        {
          json: { name: "Org 2" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const org2 = await org2Response.json();

      // Create invitation in first organization
      const createResponse = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: organizationId },
          json: {
            inviter: { name: "Test" },
            invitee: { email: "test@example.com" },
            client_id: "client_123",
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const invitation = await createResponse.json();

      // Try to get it from second organization
      const getResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$get(
        {
          param: {
            id: org2.id,
            invitation_id: invitation.id,
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(getResponse.status).toBe(404);
    });
  });

  describe("DELETE /organizations/:id/invitations/:invitation_id", () => {
    it("should delete an invitation", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      // Create an invitation
      const createResponse = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: organizationId },
          json: {
            inviter: { name: "Test" },
            invitee: { email: "delete@example.com" },
            client_id: "client_123",
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const invitation = await createResponse.json();

      // Delete the invitation
      const deleteResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$delete(
        {
          param: {
            id: organizationId,
            invitation_id: invitation.id,
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(deleteResponse.status).toBe(204);

      // Verify it's deleted
      const getResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$get(
        {
          param: {
            id: organizationId,
            invitation_id: invitation.id,
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(getResponse.status).toBe(404);
    });

    it("should return 404 when deleting non-existent invitation", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      const deleteResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$delete(
        {
          param: {
            id: organizationId,
            invitation_id: "inv_nonexistent",
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(deleteResponse.status).toBe(404);
    });

    it("should return 404 when deleting invitation from wrong organization", async () => {
      const { organizationId, managementClient, token } =
        await createTestOrganization();

      // Create a second organization
      const org2Response = await managementClient.organizations.$post(
        {
          json: { name: "Org 2" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const org2 = await org2Response.json();

      // Create invitation in first organization
      const createResponse = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: organizationId },
          json: {
            inviter: { name: "Test" },
            invitee: { email: "test@example.com" },
            client_id: "client_123",
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const invitation = await createResponse.json();

      // Try to delete it from second organization
      const deleteResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$delete(
        {
          param: {
            id: org2.id,
            invitation_id: invitation.id,
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(deleteResponse.status).toBe(404);
    });

    it("should require authentication", async () => {
      const { managementClient } = await createTestOrganization();

      const deleteResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$delete({
        param: {
          id: "org_test",
          invitation_id: "inv_123",
        },
        header: { "tenant-id": "tenantId" },
      });

      expect(deleteResponse.status).toBe(401);
    });
  });

  describe("Tenant isolation", () => {
    it("should isolate invitations by tenant", async () => {
      const { managementClient, token } = await createTestOrganization();

      // Create organization in tenant1
      const org1Response = await managementClient.organizations.$post(
        {
          json: { name: "Tenant 1 Org" },
          header: { "tenant-id": "tenant1" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const org1 = await org1Response.json();

      // Create organization in tenant2
      const org2Response = await managementClient.organizations.$post(
        {
          json: { name: "Tenant 2 Org" },
          header: { "tenant-id": "tenant2" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      // Just ensure the organization is created, but we don't need to use it
      await org2Response.json();

      // Create invitation in tenant1
      const invite1Response = await managementClient.organizations[
        ":id"
      ].invitations.$post(
        {
          param: { id: org1.id },
          json: {
            inviter: { name: "Tenant 1" },
            invitee: { email: "tenant1@example.com" },
            client_id: "client_1",
          },
          header: { "tenant-id": "tenant1" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const invite1 = await invite1Response.json();

      // Try to access tenant1's invitation from tenant2
      const getResponse = await managementClient.organizations[
        ":id"
      ].invitations[":invitation_id"].$get(
        {
          param: {
            id: org1.id,
            invitation_id: invite1.id,
          },
          header: { "tenant-id": "tenant2" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(getResponse.status).toBe(404);
    });
  });
});
