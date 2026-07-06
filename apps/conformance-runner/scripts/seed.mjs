// Migrates and seeds the generated conformance-auth-server. The client and
// user-profile payloads live in ../fixtures/ so they can be edited as plain
// JSON instead of a shell-escaped blob in the root package.json.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "..", "fixtures");
const authServerDir = path.join(here, "..", "..", "conformance-auth-server");

// Parse + re-stringify: validates the fixture JSON up front and compacts it
// to a single line, so npm's arg re-quoting never sees embedded newlines.
const readFixture = (name) =>
  JSON.stringify(
    JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8")),
  );

const run = (args) =>
  execFileSync("npm", args, { cwd: authServerDir, stdio: "inherit" });

run(["run", "migrate"]);
run([
  "run",
  "seed",
  "--",
  "admin",
  "password2",
  "--clients",
  readFixture("seed-clients.json"),
  "--user-profile",
  readFixture("seed-user-profile.json"),
]);
