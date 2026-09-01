import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readE2eRuntimeEnv } from "./runtime-env.mjs";
import { startE2eServer, stopE2eServer } from "./server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function runE2eDbCleanup() {
  return new Promise((resolve, reject) => {
    const cleanup = spawn("npx tsx scripts/cleanup-test-data.ts", {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    cleanup.on("error", reject);
    cleanup.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`E2E DB cleanup exited with code ${code ?? 1}`));
    });
  });
}

let didSpawn = false;

try {
  ({ didSpawn } = await startE2eServer());
  const runtime = readE2eRuntimeEnv();

  const exitCode = await new Promise((resolve) => {
    const vitest = spawn("npx vitest run --config vitest.e2e.config.mjs", {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        VITEST_E2E_BASE_URL: runtime.baseUrl,
        VITEST_E2E_ADMIN_EMAIL: runtime.adminEmail,
        VITEST_E2E_JUNIOR_EMAIL: runtime.juniorEmail,
        VITEST_E2E_PASSWORD: runtime.password,
      },
    });
    vitest.on("exit", (code) => resolve(code ?? 1));
  });

  process.exitCode = exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopE2eServer(didSpawn);
  try {
    await runE2eDbCleanup();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}
