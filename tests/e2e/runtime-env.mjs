import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const E2E_ENV_FILE = path.join(root, "tests/e2e/.runtime-env.json");

export function writeE2eRuntimeEnv(env) {
  fs.writeFileSync(E2E_ENV_FILE, JSON.stringify(env, null, 2));
}

export function readE2eRuntimeEnv() {
  return JSON.parse(fs.readFileSync(E2E_ENV_FILE, "utf8"));
}

export function removeE2eRuntimeEnv() {
  if (fs.existsSync(E2E_ENV_FILE)) {
    fs.unlinkSync(E2E_ENV_FILE);
  }
}
