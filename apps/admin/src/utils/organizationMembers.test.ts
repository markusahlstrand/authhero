import { describe, expect, it } from "vitest";
import { resolveOrganizationMemberDeletion } from "./organizationMembers";

describe("resolveOrganizationMemberDeletion", () => {
  it("uses organization_id and user_ids from previousData", () => {
    // The members tab passes the org id both as `id` and in `previousData`.
    expect(
      resolveOrganizationMemberDeletion({
        id: "org_ugr0po77ljtd2il57",
        previousData: {
          organization_id: "org_ugr0po77ljtd2il57",
          user_id: "google-oauth2|108791004671072817794",
          user_ids: ["google-oauth2|108791004671072817794"],
        },
      }),
    ).toEqual({
      organization_id: "org_ugr0po77ljtd2il57",
      user_ids: ["google-oauth2|108791004671072817794"],
    });
  });

  it("does not split an org_-prefixed id on underscores", () => {
    // Regression: org ids start with `org_`, so an id-splitting heuristic
    // turned `org_6hse0jwqa0utzacrh` into organization `org` + user
    // `6hse0jwqa0utzacrh`, producing DELETE /organizations/org/members (404).
    expect(
      resolveOrganizationMemberDeletion({
        id: "org_6hse0jwqa0utzacrh",
        previousData: {
          organization_id: "org_6hse0jwqa0utzacrh",
          user_ids: ["auth0|user1"],
        },
      }),
    ).toEqual({
      organization_id: "org_6hse0jwqa0utzacrh",
      user_ids: ["auth0|user1"],
    });
  });

  it("prefers an explicit members list", () => {
    expect(
      resolveOrganizationMemberDeletion({
        id: "org_abc",
        previousData: {
          members: ["auth0|user1", "auth0|user2"],
          user_id: "auth0|ignored",
        },
      }),
    ).toEqual({
      organization_id: "org_abc",
      user_ids: ["auth0|user1", "auth0|user2"],
    });
  });

  it("falls back to a single user_id", () => {
    expect(
      resolveOrganizationMemberDeletion({
        id: "org_abc",
        previousData: { user_id: "auth0|user1" },
      }),
    ).toEqual({
      organization_id: "org_abc",
      user_ids: ["auth0|user1"],
    });
  });

  it("throws when no user ids can be resolved", () => {
    expect(() =>
      resolveOrganizationMemberDeletion({
        id: "org_abc",
        previousData: {},
      }),
    ).toThrow(/Missing organization_id or user_id/);
  });
});
