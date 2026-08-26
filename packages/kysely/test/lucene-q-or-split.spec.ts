import { describe, expect, it, beforeEach } from "vitest";
import { escapeLuceneValue } from "@authhero/adapter-interfaces";
import { getTestServer } from "./helpers/test-server";

// The `q` grammar splits on the OR operator *after* tokenizing, so a value
// containing ` OR ` can no longer break out of its clause and widen the match
// (issue #1264). Mirrored by packages/drizzle/test/adapters/filtering.test.ts.
const VICTIM = "auth0|victim";
const ATTACKER = "auth0|attacker";
const CRAFTED = `${ATTACKER} OR user_id:${VICTIM} OR x`;

describe("lucene q filter: OR split vs quoting", () => {
  let data: Awaited<ReturnType<typeof getTestServer>>["data"];

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;
    await data.tenants.create({
      id: "t1",
      friendly_name: "T1",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const mk = (user_id: string, email: string, name: string) =>
      data.users.create("t1", {
        user_id,
        email,
        name,
        email_verified: true,
        is_social: false,
        provider: "auth0",
        connection: "Username-Password-Authentication",
      });

    await mk(VICTIM, "victim@example.com", "Victim");
    await mk(ATTACKER, "attacker@example.com", "Attacker");
    await mk(CRAFTED, "crafted@example.com", "Crafted");
  });

  const list = async (q: string) => {
    const res = await data.users.list("t1", { q, per_page: 50 });
    return res.users.map((u) => u.user_id).sort();
  };

  it("does not widen the match for a crafted three-part quoted value", async () => {
    // Before the fix the ` OR ` split ran first, so the middle fragment
    // `user_id:auth0|victim` became a clause of its own and matched the
    // victim's row.
    expect(await list(`user_id:"${CRAFTED}"`)).toEqual([CRAFTED]);
  });

  it("does not widen the match for a crafted value that matches no row", async () => {
    expect(
      await list(`user_id:"${ATTACKER} OR user_id:${VICTIM} OR x2"`),
    ).toEqual([]);
  });

  it("keeps an escaped value contained even when it carries a quote", async () => {
    const evil = `${ATTACKER}" OR user_id:${VICTIM} OR "x`;
    expect(await list(`user_id:${escapeLuceneValue(evil)}`)).toEqual([]);
  });

  it("round-trips a plain value through escapeLuceneValue", async () => {
    expect(await list(`user_id:${escapeLuceneValue(VICTIM)}`)).toEqual([
      VICTIM,
    ]);
    expect(await list(`user_id:${escapeLuceneValue(CRAFTED)}`)).toEqual([
      CRAFTED,
    ]);
  });

  it("still supports legitimate OR queries", async () => {
    expect(await list(`user_id:${VICTIM} OR user_id:${ATTACKER}`)).toEqual([
      ATTACKER,
      VICTIM,
    ]);
    expect(await list('name:"Victim" OR email:attacker@example.com')).toEqual([
      ATTACKER,
      VICTIM,
    ]);
  });

  it("conjoins several clauses inside one OR group", async () => {
    // `a b OR c` is `(a AND b) OR c` — the second clause of the first group
    // used to be swallowed into the first clause's value.
    expect(
      await list(
        `user_id:${VICTIM} email:nobody@example.com OR user_id:${ATTACKER}`,
      ),
    ).toEqual([ATTACKER]);
    expect(
      await list(
        `user_id:${VICTIM} email:victim@example.com OR user_id:${ATTACKER}`,
      ),
    ).toEqual([ATTACKER, VICTIM]);
  });
});
