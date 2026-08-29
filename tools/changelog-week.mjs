#!/usr/bin/env node
/**
 * The weekly changelog's raw material, and its completeness checkpoint.
 *
 * `apps/docs/changelog/` is the one part of the published docs that is *authored*
 * rather than emitted — a digest of a week's merges, written for someone running or
 * integrating AuthHero rather than for someone reading `git log`. No producer could
 * write the prose, so it carries no "generated" mark and no re-emit gate.
 *
 * One thing about it *is* mechanical, though, and it is the thing that will rot:
 * **completeness**. An author — human or agent — who silently drops a third of the
 * week's merges produces a page that looks finished and is wrong, and nobody notices,
 * because the only way to notice is to redo the work. That is what `--check` asserts:
 * every PR merged inside an entry's declared range is cited somewhere on its page.
 *
 * It deliberately does NOT assert the reverse. A highlight that cites the issue it
 * closes, or last week's PR for context, is citing something outside the range on
 * purpose. Missing is a defect; extra is editing.
 *
 *   node tools/changelog-week.mjs                 # the last complete week, as raw material
 *   node tools/changelog-week.mjs --week 2026-w34 # a named week
 *   node tools/changelog-week.mjs --check         # CI: every entry accounts for its range
 *
 * `--check` reads history, so it is meaningless on the shallow checkout Actions gives
 * by default — and a check that cannot check must fail rather than pass. It refuses to
 * run on a shallow clone; the CI job sets `fetch-depth: 0`.
 *
 * Ported from substrat-run/substrat (tools/changelog-week.mjs) with two adaptations for
 * this repo's history: merges are merge commits (`Merge pull request #N from …`), so a
 * release is the merge of a `changeset-release/main` branch rather than a squashed
 * `Version packages` commit; and an empty changelog directory is reported, not failed
 * on, so the gate can be wired before the first entry exists.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES = join(ROOT, "apps/docs/changelog");

/**
 * Week boundaries are Stockholm's, not the runner's.
 *
 * Git reads a naive `--since` in the local zone, so the same range would select a
 * different set of commits on a developer's laptop and on a UTC runner — a two-hour
 * window at each end where a merge belongs to a different week depending on who asks.
 * Pinning the zone makes the answer the same everywhere.
 */
const TZ = "Europe/Stockholm";

const git = (...args) =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, TZ },
  }).trim();

/** The Monday of an ISO week, as `YYYY-MM-DD`. */
function mondayOfIsoWeek(year, week) {
  // Jan 4th is always in ISO week 1, so it anchors the calendar without a table.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const isoDay = jan4.getUTCDay() || 7;
  const week1Monday = Date.UTC(year, 0, 4 - (isoDay - 1));
  const monday = new Date(week1Monday + (week - 1) * 7 * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** `2026-08-17` → `2026-08-24`. Ranges are half-open: Monday to Monday. */
function addDays(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The ISO week id — `2026-w34` — a date falls in. */
function isoWeekOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday decides the year
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d - jan1) / 86_400_000 + 1) / 7);
  return `${year}-w${String(week).padStart(2, "0")}`;
}

/** Today's calendar date in the pinned zone, as `YYYY-MM-DD`. */
function todayIn(tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * The last week that has fully ended — never the one still in progress. "Today" is
 * Stockholm's, like every other boundary here: at 23:30 UTC on a Sunday it is already
 * Monday in Stockholm, and the week that just ended is the one to write.
 */
function lastCompleteWeek() {
  const today = todayIn(TZ);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const thisMonday = addDays(today, -(day - 1));
  return isoWeekOf(addDays(thisMonday, -7));
}

/** `2026-w34` → `{ id, start, end }`, end exclusive. */
function weekRange(id) {
  const m = /^(\d{4})-w(\d{2})$/.exec(id);
  if (!m) throw new Error(`not a week id: ${id} (expected 2026-w34)`);
  const start = mondayOfIsoWeek(Number(m[1]), Number(m[2]));
  // `2026-w00` and `2026-w54` parse, and map onto some other week's Monday; a filename
  // carrying one would pass the range check while duplicating a real week's coverage.
  if (isoWeekOf(start) !== id) throw new Error(`not an ISO week: ${id}`);
  return { id, start, end: addDays(start, 7) };
}

/**
 * A merge commit's subject names the PR that landed it — `Merge pull request #1269
 * from …` — and a squash merge ends in it — `… (#866) (#899)`. In both shapes the
 * *last* number is the one that identifies the merge; anything earlier is an issue.
 */
function prNumberOf(subject) {
  const all = [...subject.matchAll(/#(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) : undefined;
}

/**
 * The area, for grouping. A squash subject carries a conventional-commit prefix
 * (`feat(kysely): …` → kysely); a merge-commit subject carries the branch instead
 * (`… from markusahlstrand/fix/auth0-username-validation` → fix), which is the best
 * a git-only tool can do — the PR title is in the bodies the playbook fetches.
 */
function areaOf(subject) {
  const branch = /^Merge pull request #\d+ from [^/]+\/(.+)$/.exec(subject);
  if (branch) {
    const seg = branch[1].split("/");
    return seg.length > 1 ? seg[0] : "other";
  }
  const m = /^(\w+)(?:\(([^)]+)\))?!?:/.exec(subject);
  if (!m) return "other";
  if (m[2]) return m[2].split(",")[0].trim();
  return m[1] === "docs" || m[1] === "ci" || m[1] === "chore" ? m[1] : "other";
}

/** A changesets release, in either shape this repo has used. */
function isRelease(subject) {
  return (
    /^Version packages\b/i.test(subject) ||
    /\/changeset-release\/main$/.test(subject)
  );
}

/** Every first-parent commit in a range, classified. */
function commitsIn({ start, end }) {
  const raw = git(
    "log",
    "--first-parent",
    `--since=${start} 00:00`,
    `--until=${end} 00:00`,
    "--format=%H%x1f%ad%x1f%s",
    "--date=format-local:%Y-%m-%d",
  );
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    const [sha, date, subject] = line.split("\x1f");
    const release = isRelease(subject);
    const plumbing = /^Merge branch\b/.test(subject);
    return {
      sha,
      date,
      subject,
      release,
      plumbing,
      pr: prNumberOf(subject),
      area: areaOf(subject),
    };
  });
}

/** Per package, the first and last version tagged inside the range, in commit order. */
function releasesIn(range) {
  const spans = new Map();
  for (const c of commitsIn(range).slice().reverse()) {
    if (!c.release) continue;
    for (const tag of git("tag", "--points-at", c.sha)
      .split("\n")
      .filter(Boolean)) {
      const at = tag.lastIndexOf("@");
      const [name, version] = [tag.slice(0, at), tag.slice(at + 1)];
      const span = spans.get(name);
      if (span) span.to = version;
      else spans.set(name, { from: version, to: version });
    }
  }
  return [...spans.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// ── report ────────────────────────────────────────────────────────────────────

function report(id) {
  const range = weekRange(id);
  const commits = commitsIn(range);
  const merges = commits.filter((c) => !c.plumbing && !c.release);
  const direct = merges.filter((c) => c.pr === undefined);

  console.log(`# ${id} — ${range.start} to ${addDays(range.end, -1)}\n`);
  console.log(
    `${merges.length} merges, ${commits.filter((c) => c.release).length} releases, ` +
      `${direct.length} pushed without a PR.\n`,
  );

  const byArea = new Map();
  for (const c of merges)
    byArea.set(c.area, [...(byArea.get(c.area) ?? []), c]);
  for (const [area, list] of [...byArea].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`## ${area} (${list.length})`);
    for (const c of list)
      console.log(`  ${c.date}  ${c.pr ? `#${c.pr}` : "  —  "}  ${c.subject}`);
    console.log("");
  }

  const spans = releasesIn(range);
  if (spans.length) {
    console.log(`## released (${spans.length} packages)`);
    for (const [name, { from, to }] of spans) {
      console.log(`  ${name}  ${from === to ? from : `${from} → ${to}`}`);
    }
  }
}

// ── check ─────────────────────────────────────────────────────────────────────

function check() {
  if (git("rev-parse", "--is-shallow-repository") === "true") {
    console.error(
      "changelog: this is a shallow clone, so the history a range selects is not the " +
        "history that exists. Nothing can be verified. Set `fetch-depth: 0` on the checkout.",
    );
    process.exit(1);
  }

  const files = existsSync(ENTRIES)
    ? readdirSync(ENTRIES)
        .filter((f) => f.endsWith(".md") && f !== "index.md")
        .sort()
    : [];
  if (!files.length) {
    // Not a failure: the gate is wired before the first Monday run writes an entry.
    console.log(
      "changelog: no entries in apps/docs/changelog/ yet — nothing to check.",
    );
    return;
  }

  const problems = [];
  for (const file of files) {
    const src = readFileSync(join(ENTRIES, file), "utf8");
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
    const declared =
      fm &&
      /^range:\s*(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\s*$/m.exec(fm[1]);
    if (!declared) {
      problems.push(
        `${file}: no \`range: YYYY-MM-DD..YYYY-MM-DD\` in frontmatter (end exclusive)`,
      );
      continue;
    }
    const range = { start: declared[1], end: declared[2] };

    // The filename is a claim about which week this is; hold it to the range.
    const id = file.replace(/\.md$/, "");
    const expected = weekRange(id);
    if (expected.start !== range.start || expected.end !== range.end) {
      problems.push(
        `${file}: named ${id} (${expected.start}..${expected.end}) but declares ` +
          `${range.start}..${range.end}`,
      );
      continue;
    }

    const cited = new Set(
      [...src.matchAll(/#(\d+)/g)].map((m) => Number(m[1])),
    );
    const merges = commitsIn(range).filter((c) => !c.plumbing && !c.release);
    const missing = merges.filter(
      (c) => c.pr !== undefined && !cited.has(c.pr),
    );
    const direct = merges.filter((c) => c.pr === undefined);

    if (missing.length) {
      problems.push(
        `${file}: ${missing.length} of ${merges.length} merges are not accounted for — ` +
          `the page reads as complete and is not:\n` +
          missing.map((c) => `      #${c.pr}  ${c.subject}`).join("\n"),
      );
    }
    if (direct.length) {
      // Not a failure: a commit pushed straight to main has no PR to cite, so the
      // author has to decide what to say about it. Naming them is the whole help.
      console.log(
        `${file}: ${direct.length} commit(s) landed without a PR and cannot be cited:\n` +
          direct.map((c) => `      ${c.date}  ${c.subject}`).join("\n"),
      );
    }
  }

  if (problems.length) {
    console.error(`changelog: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("");
    process.exit(1);
  }
  console.log(
    `changelog: ${files.length} entr(ies), every merge in range accounted for.`,
  );
}

const args = process.argv.slice(2);
if (args.includes("--check")) check();
else {
  const at = args.indexOf("--week");
  report(at >= 0 ? args[at + 1] : lastCompleteWeek());
}
