import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const RELEASE_DIR = path.join(ROOT, 'release');
const BUILD_COUNTER_FILE = path.join(RELEASE_DIR, 'build-counter.txt');
const RELEASE_FRONTEND_ONLY =
  process.env.RELEASE_FRONTEND_ONLY === '1' || process.env.RELEASE_ONLY_FRONTEND === '1';
const RELEASE_PHP_ONLY =
  process.env.RELEASE_PHP_ONLY === '1' || process.env.RELEASE_ONLY_PHP === '1';
const KEEP_PATCHED = process.env.RELEASE_KEEP_PATCHED === '1';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Current date/time as YYYY-MM-DD_HHmmss (no build suffix). */
function stampPart() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/** Legacy stamp for stage dir name (YYYYMMDD-HHmmss). */
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/**
 * Compute build number "YYYY-MM-DD_HHmmss-X" with incremented X per run (same stamp => X+1).
 * Persists counter in release/build-counter.txt; in CI or when file is missing, X=1.
 */
async function getBuildNumber() {
  const now = stampPart();
  let x = 1;
  try {
    const data = await fsp.readFile(BUILD_COUNTER_FILE, 'utf8');
    const [lastStamp, lastX] = data.trim().split(/\s+/);
    const n = parseInt(lastX, 10);
    if (lastStamp === now && Number.isInteger(n) && n >= 1) {
      x = n + 1;
    }
  } catch {
    // file missing or invalid => x stays 1
  }
  await mkdirp(RELEASE_DIR);
  await fsp.writeFile(BUILD_COUNTER_FILE, `${now} ${x}`, 'utf8');
  return `${now}-${x}`;
}

async function resolveBuildNumber() {
  const override = process.env.RELEASE_BUILD_NUMBER ?? process.env.BUILD_NUMBER;
  if (typeof override === 'string' && override.trim().length > 0) return override.trim();

  // If CI already produced `build-number.txt`, reuse it for deterministic Docker builds.
  const p = path.join(ROOT, 'build-number.txt');
  try {
    const v = await fsp.readFile(p, 'utf8');
    const trimmed = v.trim();
    if (trimmed.length > 0) return trimmed;
  } catch {
    // no-op
  }

  return getBuildNumber();
}

function run(cmdOrCandidates, args, cwd) {
  const candidates = Array.isArray(cmdOrCandidates) ? cmdOrCandidates : [cmdOrCandidates];

  return new Promise((resolve, reject) => {
    let i = 0;

    const trySpawn = () => {
      const cmd = candidates[i++];
      const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

      child.on('error', (err) => {
        if (err?.code === 'ENOENT' && i < candidates.length) {
          trySpawn();
          return;
        }
        reject(err);
      });

      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} ${args.join(' ')} failed with exit code ${code}`));
      });
    };

    trySpawn();
  });
}

function bins(base) {
  if (process.platform !== 'win32') return [base];
  switch (base) {
    case 'npm':
      return ['npm.cmd', 'npm'];
    case 'npx':
      return ['npx.cmd', 'npx'];
    case 'composer':
      return ['composer.bat', 'composer.cmd', 'composer'];
    case 'tar':
      return ['tar.exe', 'tar', 'bsdtar.exe', 'bsdtar'];
    default:
      return [base];
  }
}

async function rm(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
}

async function mkdirp(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function shouldSkip(rel) {
  // Normalize to forward slashes
  const r = rel.replaceAll('\\', '/');

  // Keep runtime state on the server; do not ship it in the archive
  if (r === '.env') return true;
  if (r === 'database/database.sqlite') return true;

  // Do not ship local/build artifacts
  if (r === 'node_modules' || r.startsWith('node_modules/')) return true;
  if (r === 'tests' || r.startsWith('tests/')) return true;

  // Laravel runtime folders that should persist (logs, sessions, cached views).
  // Keep the directories (and their .gitignore placeholders), but skip runtime contents.
  if (r.startsWith('storage/logs/') && !r.endsWith('/.gitignore') && !r.endsWith('.gitignore')) return true;
  if (r.startsWith('storage/framework/sessions/') && !r.endsWith('/.gitignore') && !r.endsWith('.gitignore')) return true;
  if (r.startsWith('storage/framework/views/') && !r.endsWith('/.gitignore') && !r.endsWith('.gitignore')) return true;
  if (r.startsWith('storage/framework/cache/') && !r.endsWith('/.gitignore') && !r.endsWith('.gitignore')) return true;

  return false;
}

async function copyPhpProject(phpRoot, stageRoot) {
  async function walkCopy(src, dst, relFromPhpRoot) {
    if (shouldSkip(relFromPhpRoot)) return;

    const st = await fsp.lstat(src);
    if (st.isDirectory()) {
      await mkdirp(dst);
      const entries = await fsp.readdir(src, { withFileTypes: true });
      for (const ent of entries) {
        const childSrc = path.join(src, ent.name);
        const childDst = path.join(dst, ent.name);
        const childRel = relFromPhpRoot ? `${relFromPhpRoot}/${ent.name}` : ent.name;
        await walkCopy(childSrc, childDst, childRel);
      }
      return;
    }

    if (st.isFile()) {
      await mkdirp(path.dirname(dst));
      await fsp.copyFile(src, dst);
      return;
    }
  }

  await walkCopy(phpRoot, stageRoot, '');
}

async function copyAngularBrowserToPublic(appRoot, stagePublicDir) {
  const distRoot = path.join(appRoot, 'dist', 'zenea');
  const browserDir = path.join(distRoot, 'browser');
  const srcDir = fs.existsSync(browserDir) ? browserDir : distRoot;

  if (!fs.existsSync(srcDir)) {
    throw new Error(`Angular build output not found at ${srcDir}`);
  }

  async function walkCopy(src, dst, relFromBrowser) {
    const st = await fsp.lstat(src);
    if (st.isDirectory()) {
      await mkdirp(dst);
      const entries = await fsp.readdir(src, { withFileTypes: true });
      for (const ent of entries) {
        await walkCopy(
          path.join(src, ent.name),
          path.join(dst, ent.name),
          relFromBrowser ? `${relFromBrowser}/${ent.name}` : ent.name
        );
      }
      return;
    }

    if (st.isFile()) {
      // Never overwrite Laravel front controller / htaccess
      const rel = relFromBrowser.replaceAll('\\', '/');
      if (rel === 'index.php' || rel === '.htaccess') return;
      await mkdirp(path.dirname(dst));
      await fsp.copyFile(src, dst);
    }
  }

  await walkCopy(srcDir, stagePublicDir, '');
}

async function writeDeployNotes(stageRoot) {
  const p = path.join(stageRoot, 'DEPLOY.md');
  const contents = `## Deploy (single-folder extraction)

This release archive contains a Laravel API + Angular SPA in one folder.

- **Document root**: point your web server to \`public/\`
- **API**: served under \`/api/v1/*\`
- **SPA**: served from \`public/index.html\` (Laravel \`routes/web.php\` falls back to it for all non-API routes)

## Persistent files (NOT included in the archive)

To keep state across deployments, these paths are intentionally excluded from the release tar:

- **\`.env\`**: keep your server configuration there
- **\`database/database.sqlite\`**: keep the sqlite DB file on the server filesystem
- **\`storage/logs\`**, **\`storage/framework/{sessions,views,cache}\`**: runtime files

## First-time setup on the server (typical)

- Create \`.env\` (copy from \`.env.example\`) and set:
  - \`GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET etc.
`;
  await fsp.writeFile(p, contents, 'utf8');
}

async function writeBuildMd(stageRoot, buildNumber) {
  const p = path.join(stageRoot, 'build.MD');
  const contents = `${buildNumber}\n`;
  await fsp.writeFile(p, contents, 'utf8');
}

const BUILD_INFO_PLACEHOLDER = '{{BUILD_VERSION}}';

/** Patch build number into Angular app src/app/build-info.ts so it is compiled into the bundle. */
async function patchBuildInfoTs(appRoot, buildNumber) {
  const p = path.join(appRoot, 'src', 'app', 'build-info.ts');
  let contents = await fsp.readFile(p, 'utf8');
  contents = contents.replace(/export const BUILD_VERSION(: string)? = '[^']*';/, `export const BUILD_VERSION: string = '${buildNumber}';`);
  await fsp.writeFile(p, contents, 'utf8');
}

/** Restore build-info.ts placeholder after build so the repo stays clean. */
async function restoreBuildInfoTs(appRoot) {
  const p = path.join(appRoot, 'src', 'app', 'build-info.ts');
  let contents = await fsp.readFile(p, 'utf8');
  contents = contents.replace(/export const BUILD_VERSION(: string)? = '[^']*';/, `export const BUILD_VERSION: string = '${BUILD_INFO_PLACEHOLDER}';`);
  await fsp.writeFile(p, contents, 'utf8');
}

/** Patch build number into PHP app/build-version.php so it is available at runtime. */
async function patchBuildInfoPhp(phpRoot, buildNumber) {
  const p = path.join(phpRoot, 'app', 'build-version.php');
  let contents = await fsp.readFile(p, 'utf8');
  contents = contents.replace(/return '[^']*';/, `return '${buildNumber}';`);
  await fsp.writeFile(p, contents, 'utf8');
}

/** Restore build-version.php placeholder after build so the repo stays clean. */
async function restoreBuildInfoPhp(phpRoot) {
  const p = path.join(phpRoot, 'app', 'build-version.php');
  let contents = await fsp.readFile(p, 'utf8');
  contents = contents.replace(/return '[^']*';/, `return '${BUILD_INFO_PLACEHOLDER}';`);
  await fsp.writeFile(p, contents, 'utf8');
}

async function main() {
  const PHP_ROOT = path.join(ROOT, 'php');
  // `release.mjs` is used in two different contexts:
  // 1) Run from repo root where the Angular app lives in `app/`
  // 2) Run inside the Docker frontend stage where the Dockerfile copies `app/` contents
  //    directly into the WORKDIR (`/app`), so the Angular app is already at `ROOT/`.
  let APP_ROOT = path.join(ROOT, 'app');
  const expectedBuildInfoInRepoApp = path.join(APP_ROOT, 'src', 'app', 'build-info.ts');
  const expectedBuildInfoInRoot = path.join(ROOT, 'src', 'app', 'build-info.ts');
  if (!fs.existsSync(expectedBuildInfoInRepoApp) && fs.existsSync(expectedBuildInfoInRoot)) {
    APP_ROOT = ROOT;
  }

  const buildNumber = await resolveBuildNumber();

  if (RELEASE_FRONTEND_ONLY) {
    // Patch build number into Angular app (src/app/build-info.ts) then build.
    await patchBuildInfoTs(APP_ROOT, buildNumber);
    try {
      await run(bins('npm'), ['run', 'build'], APP_ROOT);
    } finally {
      if (!KEEP_PATCHED) await restoreBuildInfoTs(APP_ROOT);
    }
    console.log(`\nBuild: ${buildNumber}\n(frontend injection only)\n`);
    return;
  }

  if (RELEASE_PHP_ONLY) {
    // Patch build number into PHP app/build-version.php for runtime access.
    await patchBuildInfoPhp(PHP_ROOT, buildNumber);
    if (!KEEP_PATCHED) await restoreBuildInfoPhp(PHP_ROOT);
    console.log(`\nBuild: ${buildNumber}\n(PHP injection only)\n`);
    return;
  }

  const id = stamp();
  const stageDir = path.join(RELEASE_DIR, `stage-${id}`);
  await mkdirp(stageDir);

  // 1) Patch build number into Angular app (src/app/build-info.ts) then build
  await patchBuildInfoTs(APP_ROOT, buildNumber);
  try {
    await run(bins('npm'), ['run', 'build'], APP_ROOT);
  } finally {
    if (!KEEP_PATCHED) await restoreBuildInfoTs(APP_ROOT);
  }

  // 2) Install PHP deps (no frontend build in php/; Angular is the frontend)
  // Set platform to match current PHP so lock file (e.g. Symfony 8 / PHP 8.4) installs in CI
  await run(bins('composer'), ['config', 'platform.php', '8.4', '--working-dir', PHP_ROOT], ROOT);
  await run(bins('composer'), ['install', '--no-dev', '--optimize-autoloader', '--working-dir', PHP_ROOT], ROOT);

  // 3) Patch build number into PHP app (app/build-version.php) then stage Laravel project
  await patchBuildInfoPhp(PHP_ROOT, buildNumber);
  try {
    // Stage Laravel project (excluding .env, sqlite, runtime storage)
    await copyPhpProject(PHP_ROOT, stageDir);
  } finally {
    if (!KEEP_PATCHED) await restoreBuildInfoPhp(PHP_ROOT);
  }

  // 4) Merge Angular build output into Laravel public/
  await copyAngularBrowserToPublic(APP_ROOT, path.join(stageDir, 'public'));

  // 5) Add deployment notes and build number file
  await writeDeployNotes(stageDir);
  await writeBuildMd(stageDir, buildNumber);

  // 6) Create single gzipped tarball at repo root (paths inside: vendor/, public/, app/, build.MD, etc.)
  // One outermost artifact: ZenEA.tgz (no release/ folder in the artifact zip)
  const outTgz = path.join(ROOT, 'ZenEA.tgz');
  await run(bins('tar'), ['-czf', outTgz, '-C', stageDir, '.'], ROOT);

  // 7) Write build number to repo root for CI (GitLab release tag/name)
  const buildNumberPath = path.join(ROOT, 'build-number.txt');
  await fsp.writeFile(buildNumberPath, buildNumber, 'utf8');

  console.log(`\nBuild: ${buildNumber}\nRelease created: ${outTgz}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

