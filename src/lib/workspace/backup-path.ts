import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES = [
  "data/tracker-data.json",
  "../context/SPX TASK TRACKER/SPX TASK TRACKER/data/tracker-data.json",
  "../../context/SPX TASK TRACKER/SPX TASK TRACKER/data/tracker-data.json",
];

export function getTrackerBackupPath(fromDir = process.cwd()): string {
  for (const relative of CANDIDATES) {
    const candidate = path.resolve(fromDir, relative);
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Could not find tracker-data.json. Place it at data/tracker-data.json or keep the original export in context/SPX TASK TRACKER.",
  );
}
