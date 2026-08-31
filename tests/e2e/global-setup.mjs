import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import {
  removeE2eRuntimeEnv,
  writeE2eRuntimeEnv,
} from "./runtime-env.mjs";

const port = process.env.E2E_PORT ?? "3099";
const defaultSpawnUrl = `http://127.0.0.1:${port}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;

const PROBE_URLS = [
  process.env.E2E_BASE_URL,
  "http://127.0.0.1:3000",
  defaultSpawnUrl,
].filter(Boolean);

async function probeHealth(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function findHealthyServer(urls) {
  for (const url of urls) {
    const normalized = url.replace(/\/$/, "");
    if (await probeHealth(normalized)) {
      return normalized;
    }
  }
  return null;
}

async function waitForHealth(url, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await probeHealth(url)) return;
    await sleep(1000);
  }
  throw new Error(
    `Timed out waiting for ${url}/api/health. ` +
      "Start the app with `npm run dev` in another terminal, or stop any existing Next dev server and retry.",
  );
}

async function waitForLogin(url, email, password, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 200) return;
      if (response.status === 401) {
        const body = await response.text();
        throw new Error(`E2E login failed (${response.status}): ${body}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("E2E login failed")) {
        throw error;
      }
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for login readiness at ${url}`);
}

function spawnDevServer(targetPort) {
  return new Promise((resolve, reject) => {
    const devChild = spawn(`npm run dev -- -p ${targetPort}`, {
      cwd: root,
      env: { ...process.env, PORT: targetPort },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stderr = "";
    devChild.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (process.env.E2E_VERBOSE === "1") {
        process.stderr.write(chunk);
      }
    });
    devChild.stdout?.on("data", (chunk) => {
      if (process.env.E2E_VERBOSE === "1") {
        process.stdout.write(chunk);
      }
    });

    devChild.on("error", reject);
    devChild.on("exit", (code) => {
      if (code !== null && code !== 0) {
        reject(
          new Error(
            `next dev exited with code ${code}. ${stderr.slice(-500)}`.trim(),
          ),
        );
      }
    });

    child = devChild;
    resolve(devChild);
  });
}

export default async function globalSetup() {
  const { ensureE2eUsers, disconnectE2eDb, E2E_SUPER_EMAIL, E2E_JUNIOR_EMAIL, E2E_PASSWORD } =
    await import("./ensure-test-users.ts");

  await ensureE2eUsers();
  await disconnectE2eDb();

  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? E2E_SUPER_EMAIL;
  const juniorEmail = process.env.E2E_JUNIOR_EMAIL ?? E2E_JUNIOR_EMAIL;
  const password = process.env.E2E_PASSWORD ?? E2E_PASSWORD;

  let resolvedBaseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, "") ?? null;
  let spawned = false;

  if (!resolvedBaseUrl) {
    resolvedBaseUrl = await findHealthyServer(PROBE_URLS);
  }

  if (resolvedBaseUrl) {
    writeE2eRuntimeEnv({
      baseUrl: resolvedBaseUrl,
      adminEmail,
      juniorEmail,
      password,
    });
  }

  if (!resolvedBaseUrl) {
    try {
      await spawnDevServer(port);
      spawned = true;
      resolvedBaseUrl = defaultSpawnUrl;
      await waitForHealth(resolvedBaseUrl);
    } catch (spawnError) {
      const fallback = await findHealthyServer(["http://127.0.0.1:3000", defaultSpawnUrl]);
      if (fallback) {
        if (child) {
          child.kill("SIGTERM");
          child = null;
        }
        resolvedBaseUrl = fallback;
        if (process.env.E2E_VERBOSE === "1") {
          console.warn(
            `[e2e] Could not spawn dev server on :${port}; reusing ${fallback}`,
            spawnError instanceof Error ? spawnError.message : spawnError,
          );
        }
      } else {
        throw spawnError;
      }
    }
  }

  await waitForLogin(resolvedBaseUrl, adminEmail, password);

  writeE2eRuntimeEnv({
    baseUrl: resolvedBaseUrl,
    adminEmail,
    juniorEmail,
    password,
  });

  return async () => {
    removeE2eRuntimeEnv();
    if (!spawned || !child) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => {
        child.on("exit", resolve);
      }),
      sleep(5000).then(() => {
        child.kill("SIGKILL");
      }),
    ]);
  };
}
