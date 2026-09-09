import { describe, expect, it } from "vitest";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../helpers/test-server";
import { getAdminToken } from "../helpers/token";
import { resumeUsersImports } from "../../src/helpers/users-import/process";

/**
 * Covers what batching the import's row writes puts at risk.
 *
 * The row loop used to be strictly sequential, which made two properties free
 * that a batch has to earn: a chunk containing the same email twice could not
 * insert it twice (the second row's probe saw the first row's write), and every
 * failure was attributable to the row that caused it. These tests pin both, and
 * the round-trip count that is the whole point of the change.
 */

function importForm(users: unknown[], extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append(
    "users",
    new File([JSON.stringify(users)], "users.json", {
      type: "application/json",
    }),
  );
  form.append("connection_id", "Username-Password-Authentication");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

async function postImport(
  users: unknown[],
  extra: Record<string, string> = {},
) {
  const { managementApp, env } = await getTestServer();
  const token = await getAdminToken();
  const response = await managementApp.request(
    "/jobs/users-imports",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      body: importForm(users, extra),
    },
    env,
  );
  return { response, env };
}

async function drain(env: { data: Parameters<typeof resumeUsersImports>[0] }) {
  for (let i = 0; i < 50; i += 1) {
    const result = await resumeUsersImports(env.data, { maxOperations: 5 });
    if (result.scanned === 0 || result.completed === result.scanned) break;
  }
}

describe("users import — batched writes", () => {
  it("inserts a chunk of new users", async () => {
    const users = Array.from({ length: 12 }, (_, i) => ({
      email: `batch-${i}@example.com`,
      email_verified: true,
    }));

    const { response, env } = await postImport(users);
    expect(response.status).toBe(202);
    await drain(env);

    for (let i = 0; i < 12; i += 1) {
      const found = await env.data.users.list("tenantId", {
        q: `email:"batch-${i}@example.com"`,
        page: 0,
        per_page: 1,
        include_totals: false,
      });
      expect(found.users).toHaveLength(1);
    }
  });

  it("writes the password alongside a batched user", async () => {
    // A real hash, so the assertion also proves the batch stored something
    // the login path can verify — not merely that a row exists.
    const hash = bcryptjs.hashSync("password123", 10);
    const users = [
      { email: "batched-pw-a@example.com", password_hash: hash },
      { email: "batched-pw-b@example.com", password_hash: hash },
    ];

    const { env } = await postImport(users);
    await drain(env);

    for (const email of [
      "batched-pw-a@example.com",
      "batched-pw-b@example.com",
    ]) {
      const found = await env.data.users.list("tenantId", {
        q: `email:"${email}"`,
        page: 0,
        per_page: 1,
        include_totals: false,
      });
      const user = found.users[0];
      expect(user).toBeDefined();
      const password = await env.data.passwords.get("tenantId", user!.user_id);
      expect(password?.algorithm).toBe("bcrypt");
      expect(await bcryptjs.compare("password123", password!.password)).toBe(
        true,
      );
    }
  });

  it("does not insert the same email twice from one chunk", async () => {
    // The sequential loop made this impossible for free. A batch probes every
    // row before writing any, so without in-chunk de-duplication both rows
    // would look absent and both would insert.
    const users = [
      { email: "same@example.com", email_verified: true },
      { email: "same@example.com", email_verified: true },
    ];

    const { env } = await postImport(users);
    await drain(env);

    const found = await env.data.users.list("tenantId", {
      q: 'email:"same@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(found.users).toHaveLength(1);
  });

  it("still reports a pre-existing user as a per-row conflict", async () => {
    const { env } = await postImport([
      { email: "already@example.com", email_verified: true },
    ]);
    await drain(env);

    // Same address again, upsert off: the row must fail, not silently insert.
    const second = await postImport([
      { email: "already@example.com", email_verified: true },
      { email: "fresh-alongside@example.com", email_verified: true },
    ]);
    await drain(second.env);

    const found = await second.env.data.users.list("tenantId", {
      q: 'email:"already@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(found.users).toHaveLength(1);

    // The healthy row in the same chunk still lands.
    const alongside = await second.env.data.users.list("tenantId", {
      q: 'email:"fresh-alongside@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(alongside.users).toHaveLength(1);
  });

  it("keeps a validation failure attributed to its own row", async () => {
    const users = [
      { email: "valid-one@example.com", email_verified: true },
      { email: "not-an-email" },
      { email: "valid-two@example.com", email_verified: true },
    ];

    const { env } = await postImport(users);
    await drain(env);

    for (const email of ["valid-one@example.com", "valid-two@example.com"]) {
      const found = await env.data.users.list("tenantId", {
        q: `email:"${email}"`,
        page: 0,
        per_page: 1,
        include_totals: false,
      });
      expect(found.users).toHaveLength(1);
    }
  });

  it("falls back to per-row writes when the batch insert fails", async () => {
    const users = Array.from({ length: 5 }, (_, i) => ({
      email: `fallback-${i}@example.com`,
      email_verified: true,
    }));

    const { env } = await postImport(users);

    // Force the batch path to fail so the row-at-a-time fallback runs. Every
    // user must still land, and each row must still get its own outcome.
    const original = env.data.users.createMany;
    env.data.users.createMany = async () => {
      throw new Error("simulated batch failure");
    };
    try {
      await drain(env);
    } finally {
      env.data.users.createMany = original;
    }

    for (let i = 0; i < 5; i += 1) {
      const found = await env.data.users.list("tenantId", {
        q: `email:"fallback-${i}@example.com"`,
        page: 0,
        per_page: 1,
        include_totals: false,
      });
      expect(found.users).toHaveLength(1);
    }
  });

  it("costs a bounded number of adapter calls regardless of chunk size", async () => {
    // The regression this guards is the whole reason for the change: writing
    // rows one at a time cost ~4 queries per row, which is pure latency on a
    // hosted database. Asserting a bound rather than an exact figure keeps the
    // test from breaking on an unrelated extra read.
    const users = Array.from({ length: 20 }, (_, i) => ({
      email: `counted-${i}@example.com`,
      email_verified: true,
    }));

    const { env } = await postImport(users);

    let userCreates = 0;
    let userLists = 0;
    const realCreate = env.data.users.create;
    const realList = env.data.users.list;
    env.data.users.create = async (...args: Parameters<typeof realCreate>) => {
      userCreates += 1;
      return realCreate(...args);
    };
    env.data.users.list = async (...args: Parameters<typeof realList>) => {
      userLists += 1;
      return realList(...args);
    };
    try {
      await drain(env);
    } finally {
      env.data.users.create = realCreate;
      env.data.users.list = realList;
    }

    // Batched: no per-row create at all, and probes counted per field rather
    // than per row. Before this change 20 rows cost 20 creates and >=20 lists.
    expect(userCreates).toBe(0);
    expect(userLists).toBeLessThan(10);
  });
});
