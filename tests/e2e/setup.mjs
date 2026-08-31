import fs from "node:fs";
import { readE2eRuntimeEnv, E2E_ENV_FILE } from "./runtime-env.mjs";

export default function e2eSetup() {
  if (!fs.existsSync(E2E_ENV_FILE)) {
    throw new Error(
      "E2E runtime env missing. Run `npm run test:e2e` (do not call vitest directly).",
    );
  }

  const env = readE2eRuntimeEnv();
  process.env.VITEST_E2E_BASE_URL = env.baseUrl;
  process.env.VITEST_E2E_ADMIN_EMAIL = env.adminEmail;
  process.env.VITEST_E2E_JUNIOR_EMAIL = env.juniorEmail;
  process.env.VITEST_E2E_PASSWORD = env.password;
}
