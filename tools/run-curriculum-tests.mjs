// Existing installed tooling only. Tests mock PostgreSQL; never load environment files.
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
if (root.replaceAll("\\", "/").toLowerCase() !== "c:/users/hayel/desktop/ccna-platform")
  throw Error("Wrong workspace.");
for (const name of Object.keys(process.env))
  if (/DATABASE|CLERK|NEON|^PG|^REPL|^VITE_|DOTENV|NODE_OPTIONS/i.test(name))
    delete process.env[name];
process.env.RUN_DB_TESTS = "0";
process.env.RUN_REVISION_DB_TESTS = "0";
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
const folder = readdirSync("node_modules/.pnpm").find((p) => p.startsWith("vitest@3.2.7_"));
const cli = path.join(root, "node_modules/.pnpm", folder ?? "", "node_modules/vitest/vitest.mjs");
if (!existsSync(cli)) throw Error("Installed Vitest missing; no automatic install.");
const files = [
  "artifacts/api-server/src/lib/questions.validation.test.ts",
  "artifacts/api-server/src/lib/multiple-answer.test.ts",
  'artifacts/api-server/src/routes/learning-evidence.test.ts',
  'artifacts/ccna-learning/src/components/learning-evidence.test.tsx',
  'artifacts/api-server/src/lib/learning-evidence.test.ts',
  'artifacts/api-server/src/lib/nexus.test.ts',
  'artifacts/ccna-learning/src/pages/nexus.test.tsx',
  'artifacts/ccna-learning/src/components/question-content.test.tsx',
  'artifacts/api-server/src/lib/question-studio.test.ts',
  'artifacts/ccna-learning/src/components/question-bank-studio.test.tsx',
  'artifacts/api-server/src/lib/topics-management.test.ts',
  'artifacts/ccna-learning/src/components/topics-manager.test.tsx',
  'tools/phase8a-cleanup/provenance-diagnostics.test.ts',
  'tools/phase8a-cleanup/final-planner.test.ts',
  'artifacts/api-server/src/lib/admin-history-delete.test.ts',
  'artifacts/ccna-learning/src/components/admin-session.test.tsx',
  'artifacts/ccna-learning/src/lib/admin-session.test.ts',
  'artifacts/ccna-learning/src/components/admin-delete-controls.test.tsx',
  'artifacts/api-server/src/lib/admin-delete.test.ts',
  'artifacts/api-server/src/lib/practice-batch.test.ts',
  'artifacts/api-server/src/routes/admin-questions.test.ts',
  'artifacts/api-server/src/routes/admin-topics.test.ts',
  'artifacts/ccna-learning/src/lib/practice-run.test.ts',
  'tools/phase8a-cleanup/topic-dependencies.test.ts',
  'tools/phase8a-cleanup/authentication.test.ts',
  'artifacts/api-server/src/routes/learning-catalog.test.ts',
  'tools/phase8a-cleanup/planner.test.ts',
  'artifacts/ccna-learning/src/pages/legacy-cleanup.test.tsx',
  'artifacts/ccna-learning/src/lib/catalog-cache.test.ts',
  'artifacts/ccna-learning/src/lib/exam-simulator.test.ts',
  'artifacts/ccna-learning/src/pages/practice-history.test.ts',
  'artifacts/ccna-learning/src/lib/learning-progress-cache.test.ts',
  "artifacts/api-server/src/lib/curriculum.test.ts",
  "artifacts/api-server/src/routes/curriculum.test.ts",
  "artifacts/api-server/src/middlewares/auth.test.ts",
  "artifacts/api-server/src/routes/learning-progress.test.ts",
  "artifacts/api-server/src/lib/practice.test.ts",
  "artifacts/api-server/src/routes/practice.test.ts",
  "artifacts/ccna-learning/src/pages/curriculum.test.tsx",
  "artifacts/ccna-learning/src/pages/learning-progress.test.ts",
  "artifacts/ccna-learning/src/components/practice-workspace.test.tsx",
  "artifacts/ccna-learning/src/components/admin-modernization.test.tsx",
  "artifacts/ccna-learning/src/components/admin-content.test.tsx",
];
const selectedFiles=process.argv[2]==="--editor" ? files.filter(f=>/questions.validation|multiple-answer|question-studio|question-bank-studio|nexus.test|admin-delete-controls|admin-questions.test|admin-topics.test/.test(f)) : files;
if(process.argv.length>3 || process.argv[2] && process.argv[2]!=="--editor")throw Error("Unknown offline test selection");
const result = spawnSync(
  process.execPath,
  [
    cli,
    "run",
    "--config",
    path.join(root, "tools/admin-unit.config.mjs"),
    ...selectedFiles,
    "--reporter=dot",
  ],
  { cwd: root, env: process.env, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
