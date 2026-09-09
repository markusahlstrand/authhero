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
  const server = await getTestServer();
  const response = await postImportWith(server, users, extra);
  return { response, env: server.env, server };
}

/**
 * Submit into an existing server. `getTestServer()` builds a fresh in-memory
 * database every call, so anything asserting on state left by a previous import
 * MUST reuse the server rather than calling `postImport` twice.
 */
async function postImportWith(
  server: Awaited<ReturnType<typeof getTestServer>>,
  users: unknown[],
  extra: Record<string, string> = {},
) {
  const token = await getAdminToken();
  return server.managementApp.request(
    "/jobs/users-imports",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      body: importForm(users, extra),
    },
    server.env,
  );
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
    const { env, server } = await postImport([
      { email: "already@example.com", email_verified: true },
    ]);
    await drain(env);

    // Same server, so the second import genuinely sees the first one's user.
    // Two getTestServer() calls would each get their own in-memory database
    // and the assertion would pass without a conflict ever occurring.
    const second = await postImportWith(server, [
      { email: "already@example.com", email_verified: true },
      { email: "fresh-alongside@example.com", email_verified: true },
    ]);
    expect(second.status).toBe(202);
    const job = await second.json();
    await drain(env);

    // The conflict is recorded against its own row, not swallowed by the batch.
    const errorsResponse = await server.managementApp.request(
      `/jobs/${job.id}/errors`,
      {
        headers: {
          authorization: `Bearer ${await getAdminToken()}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    const errors = await errorsResponse.json();
    expect(errors).toHaveLength(1);
    expect(errors[0].errors[0].code).toBe("USER_ALREADY_EXISTS");

    // Still exactly one user for that address.
    const found = await env.data.users.list("tenantId", {
      q: 'email:"already@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(found.users).toHaveLength(1);

    // And the healthy row in the same chunk still lands.
    const alongside = await env.data.users.list("tenantId", {
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

    const server = await getTestServer();
    const env = server.env;

    // Force the batch path to fail so the row-at-a-time fallback runs. Every
    // user must still land, and each row must still get its own outcome.
    //
    // Installed BEFORE the request: the accept route kicks the first chunk off
    // via `waitUntil`, which outside Workers is flushed before the response
    // returns, so anything these five rows do has already happened by the time
    // `postImportWith` resolves. Overriding afterwards would leave the test
    // passing with the fallback never exercised.
    const original = env.data.users.createMany;
    env.data.users.createMany = async () => {
      throw new Error("simulated batch failure");
    };
    try {
      const response = await postImportWith(server, users);
      expect(response.status).toBe(202);
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

  it("re-resolves identity per row when upserting", async () => {
    // An upsert chunk cannot share one identity snapshot. Here row 1 renames
    // the existing user's username, which frees that username for row 2: the
    // sequential loop created a second user, while a chunk-wide snapshot still
    // points row 2 at the user row 1 just renamed and updates it twice.
    const server = await getTestServer();
    const env = server.env;

    await postImportWith(server, [
      { email: "shift-a@example.com", username: "shared-name" },
    ]);
    await drain(env);

    const second = await postImportWith(
      server,
      [
        { email: "shift-a@example.com", username: "renamed" },
        { email: "shift-b@example.com", username: "shared-name" },
      ],
      { upsert: "true" },
    );
    expect(second.status).toBe(202);
    await drain(env);

    // Row 2 is its own user, not a second write to row 1's.
    const b = await env.data.users.list("tenantId", {
      q: 'email:"shift-b@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(b.users).toHaveLength(1);

    const a = await env.data.users.list("tenantId", {
      q: 'email:"shift-a@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(a.users).toHaveLength(1);
    expect(a.users[0]!.username).toBe("renamed");
    expect(a.users[0]!.user_id).not.toBe(b.users[0]!.user_id);
  });

  it("does not let a crafted value widen an existence probe", async () => {
    // Probe values are interpolated into a Lucene query. Escaping only quotes
    // lets a value ending in a backslash close its own clause and append an
    // OR, so the probe matches an unrelated user — and on an upsert that
    // user's row is then overwritten with the imported row's values.
    const server = await getTestServer();
    const env = server.env;

    await postImportWith(server, [{ email: "victim@example.com" }]);
    await drain(env);
    const before = await env.data.users.list("tenantId", {
      q: 'email:"victim@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(before.users).toHaveLength(1);

    const crafted =
      'craft\\" OR email:victim@example.com OR username:"tail';
    const second = await postImportWith(
      server,
      [{ email: "attacker@example.com", username: crafted }],
      { upsert: "true" },
    );
    expect(second.status).toBe(202);
    await drain(env);

    // The victim is untouched and the crafted row became its own user.
    const victim = await env.data.users.get(
      "tenantId",
      before.users[0]!.user_id,
    );
    expect(victim?.email).toBe("victim@example.com");
    const attacker = await env.data.users.list("tenantId", {
      q: 'email:"attacker@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(attacker.users).toHaveLength(1);
    expect(attacker.users[0]!.user_id).not.toBe(before.users[0]!.user_id);
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

    const server = await getTestServer();
    const env = server.env;

    let userCreates = 0;
    let userLists = 0;
    let batchCalls = 0;
    // `rawCreate` is what the per-row path ultimately reaches: the management
    // API wraps `create` in the registration hooks, which commit through
    // `rawCreate`, so counting only `create` would miss a fallback entirely.
    const realCreate = env.data.users.rawCreate;
    const realList = env.data.users.list;
    const realCreateMany = env.data.users.createMany!;
    // Counters must be in place before the POST: the inline kick processes all
    // 20 rows (one chunk is 50) inside the request, so instrumenting after it
    // returns would measure an import that is already over — and the test
    // would pass just as happily against the row-at-a-time implementation.
    env.data.users.rawCreate = async (
      ...args: Parameters<typeof realCreate>
    ) => {
      userCreates += 1;
      return realCreate(...args);
    };
    env.data.users.list = async (...args: Parameters<typeof realList>) => {
      userLists += 1;
      return realList(...args);
    };
    env.data.users.createMany = async (
      ...args: Parameters<typeof realCreateMany>
    ) => {
      batchCalls += 1;
      return realCreateMany(...args);
    };
    try {
      const response = await postImportWith(server, users);
      expect(response.status).toBe(202);
      await drain(env);
    } finally {
      env.data.users.rawCreate = realCreate;
      env.data.users.list = realList;
      env.data.users.createMany = realCreateMany;
    }

    // All 20 users landed — a cheap import that imported nothing would also
    // score well on the counters.
    const imported = await env.data.users.list("tenantId", {
      q: 'email:"counted-0@example.com" OR email:"counted-19@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(imported.users).toHaveLength(2);

    // Batched: no per-row create at all, and probes counted per field rather
    // than per row. Before this change 20 rows cost 20 creates and >=20 lists.
    // `userCreates === 0` is also what catches a batch that throws and silently
    // falls back to the row-at-a-time path.
    expect(batchCalls).toBe(1);
    expect(userCreates).toBe(0);
    expect(userLists).toBeLessThan(10);
  });
});
