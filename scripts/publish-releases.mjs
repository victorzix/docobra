#!/usr/bin/env node
/**
 * Publishes this project's own record and release history to the portfolio API.
 *
 * Content lives in `content/` so the release text is versioned and reviewed like
 * any other change. Every request is an idempotent PUT, so re-running this after
 * correcting a file fixes the published record instead of duplicating it — which
 * means it is safe to run as often as you like, including on every deploy.
 *
 * Usage:
 *   npm run release:publish                 # reads PORTFOLIO_API_URL / _TOKEN
 *   npm run release:publish -- --dry-run    # print what would be sent, send nothing
 *
 * Environment:
 *   PORTFOLIO_API_URL    base URL, e.g. http://localhost:3100 or https://your-domain
 *   PORTFOLIO_API_TOKEN  the same secret the server reads as CHANGELOG_API_TOKEN
 *
 * Both fall back to `.env` (DATABASE_URL is not used; CHANGELOG_API_TOKEN is
 * accepted as an alias for the token) so local runs need no extra setup.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const RELEASES_DIR = path.join(CONTENT_DIR, "releases");
const DRY_RUN = process.argv.includes("--dry-run");

/** Reads KEY=value pairs from .env without adding a dependency. */
async function readEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return {};

  const out = {};
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Zero-pads each numeric component so releases publish oldest first. */
function versionSortKey(version) {
  return version
    .split(".")
    .map((part) => part.padStart(5, "0"))
    .join(".");
}

async function resolveConfig() {
  const env = { ...(await readEnvFile()), ...process.env };
  const baseUrl = env.PORTFOLIO_API_URL;
  const token = env.PORTFOLIO_API_TOKEN ?? env.CHANGELOG_API_TOKEN;

  const missing = [];
  if (!baseUrl) missing.push("PORTFOLIO_API_URL");
  if (!token) missing.push("PORTFOLIO_API_TOKEN (or CHANGELOG_API_TOKEN)");
  if (missing.length && !DRY_RUN) {
    console.error(`Missing required environment: ${missing.join(", ")}`);
    console.error("Set them in .env or the environment, or pass --dry-run.");
    process.exit(1);
  }

  return { baseUrl: baseUrl?.replace(/\/$/, ""), token };
}

async function loadContent() {
  const projectFile = path.join(CONTENT_DIR, "project.json");
  if (!existsSync(projectFile)) {
    console.error(`Missing ${path.relative(ROOT, projectFile)}`);
    process.exit(1);
  }

  const { slug, ...project } = JSON.parse(await readFile(projectFile, "utf8"));
  if (!slug) {
    console.error("content/project.json must carry a top-level \"slug\".");
    process.exit(1);
  }

  const files = existsSync(RELEASES_DIR)
    ? (await readdir(RELEASES_DIR)).filter((f) => f.endsWith(".json"))
    : [];

  const releases = await Promise.all(
    files.map(async (file) => {
      const { version, ...body } = JSON.parse(
        await readFile(path.join(RELEASES_DIR, file), "utf8"),
      );
      const declared = version ?? path.basename(file, ".json");
      if (version && version !== path.basename(file, ".json")) {
        console.warn(
          `  warning: ${file} declares version "${version}" — the filename wins for the URL`,
        );
      }
      return { version: path.basename(file, ".json"), declared, body };
    }),
  );

  releases.sort((a, b) =>
    versionSortKey(a.version).localeCompare(versionSortKey(b.version)),
  );

  return { slug, project, releases };
}

/**
 * Waits for the server to accept connections. A post-deployment hook can fire
 * before the process is listening, which would otherwise fail the whole run on
 * a transient connection error. Any HTTP response counts as up — we only care
 * that something is answering.
 */
async function waitForServer(baseUrl, attempts = 10, delayMs = 1500) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fetch(baseUrl, { method: "GET" });
      return true;
    } catch {
      if (attempt === attempts) return false;
      if (attempt === 1) console.log(`  waiting for ${baseUrl} to accept connections…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

async function put(baseUrl, token, endpoint, body, label) {
  if (DRY_RUN) {
    console.log(`  DRY-RUN  PUT ${endpoint}`);
    return true;
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`  FAIL     ${label} — ${error.message}`);
    return false;
  }

  if (response.ok) {
    const verb = response.status === 201 ? "created" : "updated";
    console.log(`  ${String(response.status).padEnd(8)} ${label} ${verb}`);
    return true;
  }

  const detail = await response.text();
  console.error(`  ${String(response.status).padEnd(8)} ${label} — ${detail.slice(0, 400)}`);
  return false;
}

const { baseUrl, token } = await resolveConfig();
const { slug, project, releases } = await loadContent();

console.log(
  DRY_RUN
    ? `Dry run — ${releases.length} release(s) for "${slug}", nothing will be sent.`
    : `Publishing "${slug}" and ${releases.length} release(s) to ${baseUrl}`,
);

let failed = 0;

if (!DRY_RUN && !(await waitForServer(baseUrl))) {
  console.error(`\nCould not reach ${baseUrl}. Is the app running?`);
  process.exit(1);
}

if (!(await put(baseUrl, token, `/api/projects/${slug}`, project, `project ${slug}`))) {
  console.error("\nAborting: the project record must land before its releases.");
  process.exit(1);
}

for (const release of releases) {
  const ok = await put(
    baseUrl,
    token,
    `/api/projects/${slug}/releases/${release.version}`,
    release.body,
    `release ${release.version}`,
  );
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} release(s) failed. Fix the payload and re-run — PUT is idempotent.`);
  process.exit(1);
}

console.log(`\nDone. ${releases.length} release(s) published.`);
