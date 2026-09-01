import { describe, it, expect } from "vitest";
import bcryptjs from "bcryptjs";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import {
  advanceUsersImport,
  resumeUsersImports,
} from "../../src/helpers/users-import/process";

/** A real bcrypt hash of "password123", as an Auth0 export would carry. */
const BCRYPT_HASH = bcryptjs.hashSync("password123", 10);

function importForm(
  users: unknown[],
  extra: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.append(
    "users",
    new File([JSON.stringify(users)], "users.json", {
      type: "application/json",
    }),
  );
  form.append("connection_id", "Username-Password-Authentication");
  for (const [key, value] of Object.entries(extra)) {
    form.append(key, value);
  }
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
      headers: {
        authorization: `Bearer ${token}`,
        "tenant-id": "tenantId",
      },
      body: importForm(users, extra),
    },
    env,
  );
  return { response, managementApp, env, token };
}

/** Drain an accepted job to completion the way the background sweep would. */
async function drain(env: { data: Parameters<typeof resumeUsersImports>[0] }) {
  for (let i = 0; i < 50; i += 1) {
    const result = await resumeUsersImports(env.data, { maxOperations: 5 });
    if (result.scanned === 0 || result.completed === result.scanned) break;
  }
}

describe("POST /api/v2/jobs/users-imports", () => {
  it("accepts a file and returns an Auth0-shaped job", async () => {
    const { response } = await postImport([
      { email: "one@example.com", password_hash: BCRYPT_HASH },
    ]);

    expect(response.status).toBe(202);
    const body = await response.json();

    expect(body.id).toMatch(/^job_/);
    expect(body.type).toBe("users_import");
    expect(["pending", "completed"]).toContain(body.status);
    expect(body.connection_id).toBe("Username-Password-Authentication");
    expect(body.summary.total).toBe(1);
  });

  it("imports a bcrypt hash the login path can actually verify", async () => {
    const { response, env } = await postImport([
      { email: "bcrypt@example.com", password_hash: BCRYPT_HASH },
    ]);
    expect(response.status).toBe(202);

    await drain(env);

    const users = await env.data.users.list("tenantId", {
      q: 'email:"bcrypt@example.com"',
      page: 0,
      per_page: 1,
      include_totals: false,
    });
    const user = users.users[0];
    expect(user).toBeDefined();

    const password = await env.data.passwords.get("tenantId", user.user_id);
    expect(password).not.toBeNull();
    expect(password?.algorithm).toBe("bcrypt");
    // The stored hash must verify against the original plaintext, which is
    // the whole point of importing a hash rather than a password.
    expect(await bcryptjs.compare("password123", password!.password)).toBe(
      true,
    );
  });

  it("accepts custom_password_hash for bcrypt", async () => {
    const { response, env } = await postImport([
      {
        email: "custom@example.com",
        custom_password_hash: {
          algorithm: "bcrypt",
          hash: { value: BCRYPT_HASH, encoding: "utf8" },
        },
      },
    ]);
    expect(response.status).toBe(202);
    await drain(env);

    const users = await env.data.users.list("tenantId", {
      q: 'email:"custom@example.com"',
      page: 0,
      per_page: 1,
      include_totals: false,
    });
    const password = await env.data.passwords.get(
      "tenantId",
      users.users[0].user_id,
    );
    expect(await bcryptjs.compare("password123", password!.password)).toBe(
      true,
    );
  });

  it("prefixes a bare user_id with the tenant's provider", async () => {
    const { env } = await postImport([
      { email: "prefixed@example.com", user_id: "abc123" },
    ]);
    await drain(env);

    const user = await env.data.users.get("tenantId", "auth0|abc123");
    expect(user).not.toBeNull();
    expect(user?.email).toBe("prefixed@example.com");
  });

  it("rejects a non-JSON file with 400", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    const form = new FormData();
    form.append("users", new File(["not json"], "users.json"));
    form.append("connection_id", "Username-Password-Authentication");

    const response = await managementApp.request(
      "/jobs/users-imports",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
        body: form,
      },
      env,
    );
    expect(response.status).toBe(400);
  });

  it("rejects an unknown connection_id with 400", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await managementApp.request(
      "/jobs/users-imports",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
        body: importForm([{ email: "x@example.com" }], {}),
      },
      env,
    );
    // Sanity: the seeded connection works, so swap it for a bogus one.
    expect(response.status).toBe(202);

    const bad = new FormData();
    bad.append("users", new File(['[{"email":"y@example.com"}]'], "u.json"));
    bad.append("connection_id", "does-not-exist");
    const response2 = await managementApp.request(
      "/jobs/users-imports",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
        body: bad,
      },
      env,
    );
    expect(response2.status).toBe(400);
  });

  it("enforces the file-size limit", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    env.usersImportMaxBytes = 50;

    const response = await managementApp.request(
      "/jobs/users-imports",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
        body: importForm([
          { email: "a-very-long-address-to-exceed@example.com" },
          { email: "another-long-address@example.com" },
        ]),
      },
      env,
    );
    expect(response.status).toBe(400);
  });

  it("rate-limits beyond the concurrent-job cap", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    env.usersImportMaxConcurrentJobs = 1;

    const send = (email: string) =>
      managementApp.request(
        "/jobs/users-imports",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "tenant-id": "tenantId",
          },
          // More rows than the accept call's inline kick drains, so the job
          // is still unfinished when the next submission arrives.
          body: importForm(
            Array.from({ length: 150 }, (_, i) => ({
              email: `${i}-${email}`,
            })),
          ),
        },
        env,
      );

    const first = await send("first@example.com");
    expect(first.status).toBe(202);

    const body = await first.json();
    const operationId = body.id.replace(/^job_/, "");
    // The accept call only makes a start, so a job this size is still in
    // flight afterwards — which is what the cap counts.
    const operation = await env.data.tenantOperations!.get(operationId);
    expect(
      operation?.status === "pending" || operation?.status === "running",
    ).toBe(true);

    const second = await send("third@example.com");
    expect(second.status).toBe(429);
  });
});

describe("bulk import error reporting", () => {
  it("fails only the unsupported-algorithm rows and imports the rest", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "good@example.com", password_hash: BCRYPT_HASH },
      {
        email: "argon@example.com",
        custom_password_hash: {
          algorithm: "argon2",
          hash: { value: "$argon2id$v=19$m=1024,t=1,p=1$c2FsdA$aGFzaA" },
        },
      },
    ]);
    expect(response.status).toBe(202);
    await drain(env);

    const jobId = (await response.json()).id;
    const errors = await managementApp.request(
      `/jobs/${jobId}/errors`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    expect(errors.status).toBe(200);
    const body = await errors.json();
    expect(body).toHaveLength(1);
    expect(body[0].user.email).toBe("argon@example.com");
    expect(body[0].errors[0].code).toBe("UNSUPPORTED_HASH_ALGORITHM");
    expect(body[0].errors[0].path).toBe("custom_password_hash.algorithm");

    // The supported row still landed.
    const good = await env.data.users.list("tenantId", {
      q: 'email:"good@example.com"',
      page: 0,
      per_page: 1,
      include_totals: false,
    });
    expect(good.users).toHaveLength(1);
  });

  it("never stores a hash it cannot verify", async () => {
    const { env } = await postImport([
      {
        email: "sha@example.com",
        custom_password_hash: {
          algorithm: "sha256",
          hash: { value: "abc123", encoding: "hex" },
        },
      },
    ]);
    await drain(env);

    const users = await env.data.users.list("tenantId", {
      q: 'email:"sha@example.com"',
      page: 0,
      per_page: 1,
      include_totals: false,
    });
    // The row failed, so no user — and therefore no unusable credential.
    expect(users.users).toHaveLength(0);
  });

  it("rejects a bcrypt variant bcryptjs cannot compare", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "old@example.com", password_hash: "$2x$10$abcdefghijklmnop" },
    ]);
    await drain(env);

    const jobId = (await response.json()).id;
    const errors = await managementApp.request(
      `/jobs/${jobId}/errors`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    const body = await errors.json();
    expect(body[0].errors[0].code).toBe("UNSUPPORTED_HASH_FORMAT");
  });

  it("flags duplicate entries within one file", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "dupe@example.com" },
      { email: "dupe@example.com" },
    ]);
    await drain(env);

    const jobId = (await response.json()).id;
    const errors = await managementApp.request(
      `/jobs/${jobId}/errors`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    const body = await errors.json();
    expect(body).toHaveLength(1);
    expect(body[0].errors[0].code).toBe("DUPLICATE_ENTRY");
  });

  it("redacts credentials from the echoed-back user object", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "dup2@example.com", password_hash: BCRYPT_HASH },
      { email: "dup2@example.com", password_hash: BCRYPT_HASH },
    ]);
    await drain(env);

    const jobId = (await response.json()).id;
    const errors = await managementApp.request(
      `/jobs/${jobId}/errors`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    const body = await errors.json();
    // The staged payload is durable and readable — it must not carry a hash.
    expect(body[0].user.password_hash).toBe("[redacted]");
    expect(JSON.stringify(body)).not.toContain(BCRYPT_HASH);
  });

  it("returns 204 when a job has no errors", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "clean@example.com" },
    ]);
    await drain(env);

    const jobId = (await response.json()).id;
    const errors = await managementApp.request(
      `/jobs/${jobId}/errors`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    expect(errors.status).toBe(204);
  });
});

describe("upsert behaviour", () => {
  it("errors on an existing user when upsert is off", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "existing@example.com" },
    ]);
    await drain(env);
    expect(response.status).toBe(202);

    const second = await managementApp.request(
      "/jobs/users-imports",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
        body: importForm([{ email: "existing@example.com", name: "Changed" }]),
      },
      env,
    );
    await drain(env);

    const jobId = (await second.json()).id;
    const errors = await managementApp.request(
      `/jobs/${jobId}/errors`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    const body = await errors.json();
    expect(body[0].errors[0].code).toBe("USER_ALREADY_EXISTS");
  });

  it("updates an existing user when upsert is on", async () => {
    const { managementApp, env, token } = await postImport([
      { email: "upsert@example.com", name: "Original" },
    ]);
    await drain(env);

    const second = await managementApp.request(
      "/jobs/users-imports",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
        body: importForm([{ email: "upsert@example.com", name: "Updated" }], {
          upsert: "true",
        }),
      },
      env,
    );
    expect(second.status).toBe(202);
    await drain(env);

    const users = await env.data.users.list("tenantId", {
      q: 'email:"upsert@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(users.users).toHaveLength(1);
    expect(users.users[0].name).toBe("Updated");

    const job = await second.json();
    const operation = await env.data.tenantOperations!.get(
      job.id.replace(/^job_/, ""),
    );
    expect(operation?.result?.updated).toBe(1);
  });

  it("upserts a match found by username rather than email", async () => {
    const { managementApp, env, token } = await postImport([
      { email: "byname@example.com", username: "sameuser", name: "Original" },
    ]);
    await drain(env);

    // Same username, different email — Auth0 matches on username too, so this
    // must update the existing user rather than create a second one.
    const second = await managementApp.request(
      "/jobs/users-imports",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
        body: importForm(
          [
            {
              email: "different@example.com",
              username: "sameuser",
              name: "Updated",
            },
          ],
          { upsert: "true" },
        ),
      },
      env,
    );
    expect(second.status).toBe(202);
    await drain(env);

    const operation = await env.data.tenantOperations!.get(
      (await second.json()).id.replace(/^job_/, ""),
    );
    expect(operation?.result?.updated).toBe(1);
    expect(operation?.result?.inserted).toBe(0);
  });
});

describe("durability", () => {
  it("resumes an interrupted import from the last committed chunk", async () => {
    // Larger than the accept call's inline kick, so the job is genuinely
    // unfinished when that request ends — the situation a crashed or evicted
    // driver leaves behind.
    const users = Array.from({ length: 150 }, (_, i) => ({
      email: `resume-${i}@example.com`,
    }));
    const { response, env } = await postImport(users);
    const jobId = (await response.json()).id;
    const operationId = jobId.replace(/^job_/, "");

    const partial =
      await env.data.tenantOperationRows!.countByStatus(operationId);
    expect(partial.pending).toBeGreaterThan(0);
    expect(partial.inserted).toBeGreaterThan(0);

    // Advance a little further, then stop — as a driver dying mid-job would.
    await advanceUsersImport(env.data, operationId, {
      maxRows: 3,
      chunkSize: 3,
    });

    // A later sweep — a different "process" entirely — finishes the job from
    // the last committed chunk.
    await drain(env);

    const final =
      await env.data.tenantOperationRows!.countByStatus(operationId);
    expect(final.pending).toBe(0);
    expect(final.inserted).toBe(150);

    const operation = await env.data.tenantOperations!.get(operationId);
    expect(operation?.status).toBe("succeeded");

    // Resumption must not have duplicated the rows it already committed.
    const all = await env.data.users.list("tenantId", {
      q: 'email:"resume-0@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(all.users).toHaveLength(1);
  });

  it("stops instead of spinning when a chunk makes no progress", async () => {
    const users = Array.from({ length: 150 }, (_, i) => ({
      email: `stall-${i}@example.com`,
    }));
    const { response, env } = await postImport(users);
    const operationId = (await response.json()).id.replace(/^job_/, "");

    // Simulate a commit that silently fails to move rows out of `pending`.
    // Without the no-progress guard this would hand the same chunk back
    // forever, re-applying the same writes on every pass.
    const rows = env.data.tenantOperationRows!;
    const original = rows.recordOutcomes.bind(rows);
    rows.recordOutcomes = async () => 0;

    const result = await Promise.race([
      advanceUsersImport(env.data, operationId, { chunkSize: 10 }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("advanceUsersImport did not return")),
          5000,
        ),
      ),
    ]);

    expect(result).toMatchObject({ done: false });

    // Recovery is unaffected: a working driver still finishes the job.
    rows.recordOutcomes = original;
    await drain(env);
    const counts = await rows.countByStatus(operationId);
    expect(counts.pending).toBe(0);
  });

  it("does not double-process when two drivers race", async () => {
    const users = Array.from({ length: 150 }, (_, i) => ({
      email: `race-${i}@example.com`,
    }));
    const { response, env } = await postImport(users);
    const operationId = (await response.json()).id.replace(/^job_/, "");

    const [a, b] = await Promise.all([
      advanceUsersImport(env.data, operationId, { workerId: "worker-a" }),
      advanceUsersImport(env.data, operationId, { workerId: "worker-b" }),
    ]);

    // Exactly one driver holds the lease; the other backs off rather than
    // redoing the same rows.
    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);

    await drain(env);

    const counts =
      await env.data.tenantOperationRows!.countByStatus(operationId);
    expect(counts.pending).toBe(0);
    expect(counts.inserted + counts.failed).toBe(150);

    // No row was processed twice.
    const one = await env.data.users.list("tenantId", {
      q: 'email:"race-0@example.com"',
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(one.users).toHaveLength(1);
  });
});

describe("GET /api/v2/jobs/{id}", () => {
  it("reports progress and a summary", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "progress@example.com" },
    ]);
    await drain(env);

    const jobId = (await response.json()).id;
    const job = await managementApp.request(
      `/jobs/${jobId}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    expect(job.status).toBe(200);

    const body = await job.json();
    expect(body.id).toBe(jobId);
    expect(body.type).toBe("users_import");
    expect(body.status).toBe("completed");
    expect(body.percentage_done).toBe(100);
    expect(body.summary).toEqual({
      total: 1,
      inserted: 1,
      updated: 0,
      failed: 0,
    });
  });

  it("never exposes an internal status or engine name", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "internal@example.com" },
    ]);
    const jobId = (await response.json()).id;

    const job = await managementApp.request(
      `/jobs/${jobId}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    const body = await job.json();
    expect(["pending", "completed", "failed"]).toContain(body.status);
    expect(JSON.stringify(body)).not.toContain("inline");
    expect(JSON.stringify(body)).not.toContain("succeeded");
  });

  it("returns 404 for a job belonging to another tenant", async () => {
    const { response, managementApp, env, token } = await postImport([
      { email: "other@example.com" },
    ]);
    const jobId = (await response.json()).id;

    const job = await managementApp.request(
      `/jobs/${jobId}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "otherTenant",
        },
      },
      env,
    );
    expect(job.status).toBe(404);
  });

  it("returns 404 for an unknown job", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const job = await managementApp.request(
      "/jobs/job_does_not_exist",
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    expect(job.status).toBe(404);
  });
});
