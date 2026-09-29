import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, lstat, readlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { classifyRisk, normalizeRepoPath } from './classify-risk.mjs';
import { loadLoopPolicy } from './policy.mjs';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '../..');
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const GIT_REVISION_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const MAX_GIT_SNAPSHOT_METADATA_BYTES = 32 * 1024 * 1024;
const MAX_GIT_SNAPSHOT_FILE_BYTES = 128 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const NPMRC_AUTH_SETTING = /^\s*(?:\/\/[^\s=]*?:)?(?:_auth(?:Token)?|_password|password|username)\s*=/im;
const CONTROL_PLANE_TEST_FILES = Object.freeze([
  'scripts/loop/__tests__/policy.test.mjs',
  'scripts/loop/__tests__/classify-risk.test.mjs',
  'scripts/loop/__tests__/fingerprint-failure.test.mjs',
  'scripts/loop/__tests__/state.test.mjs',
  'scripts/loop/__tests__/classify-failure.test.mjs',
  'scripts/loop/__tests__/controller.test.mjs',
  'scripts/loop/__tests__/contracts.test.mjs',
  'scripts/loop/__tests__/pr-evidence.test.mjs',
  'scripts/loop/__tests__/pr-state.test.mjs',
  'scripts/loop/__tests__/pr-babysitter.test.mjs',
  'scripts/loop/__tests__/pr-packets.test.mjs',
  'scripts/loop/__tests__/telemetry.test.mjs',
  'scripts/loop/__tests__/pr-contracts.test.mjs',
  'scripts/loop/__tests__/github-pr-client.test.mjs',
  'scripts/loop/__tests__/github-auth-provider.test.mjs',
  'scripts/loop/__tests__/github-actions-write.test.mjs',
  'scripts/loop/__tests__/pr-worktree-guard.test.mjs',
  'scripts/loop/__tests__/repair-session.test.mjs',
  'scripts/loop/__tests__/verify.test.mjs',
  'scripts/loop/__tests__/workflow.test.mjs',
]);

const COMMAND_REGISTRY = Object.freeze({
  'loop-tests': Object.freeze({
    id: 'loop-tests',
    command: 'node',
    args: Object.freeze(['--test', ...CONTROL_PLANE_TEST_FILES]),
    windowsCommand: `node --test ${CONTROL_PLANE_TEST_FILES.join(' ')}`,
    cwd: '.',
    packageScope: null,
  }),
  'client-typecheck': Object.freeze({
    id: 'client-typecheck',
    command: 'pnpm',
    args: Object.freeze(['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit']),
    windowsCommand: 'pnpm exec tsc -p tsconfig.json --noEmit',
    cwd: 'client',
    packageScope: 'client',
  }),
  'client-lint': Object.freeze({
    id: 'client-lint',
    command: 'pnpm',
    args: Object.freeze(['lint']),
    windowsCommand: 'pnpm lint',
    cwd: 'client',
    packageScope: 'client',
  }),
  'client-test': Object.freeze({
    id: 'client-test',
    command: 'pnpm',
    args: Object.freeze(['test', '--', '--run']),
    windowsCommand: 'pnpm test -- --run',
    cwd: 'client',
    packageScope: 'client',
  }),
  'client-build': Object.freeze({
    id: 'client-build',
    command: 'pnpm',
    args: Object.freeze(['build']),
    windowsCommand: 'pnpm build',
    cwd: 'client',
    packageScope: 'client',
  }),
  'server-prisma-validate': Object.freeze({
    id: 'server-prisma-validate',
    command: 'pnpm',
    args: Object.freeze(['prisma:validate']),
    windowsCommand: 'pnpm prisma:validate',
    cwd: 'server',
    packageScope: 'server',
  }),
  'server-typecheck': Object.freeze({
    id: 'server-typecheck',
    command: 'pnpm',
    args: Object.freeze(['typecheck']),
    windowsCommand: 'pnpm typecheck',
    cwd: 'server',
    packageScope: 'server',
  }),
  'server-lint': Object.freeze({
    id: 'server-lint',
    command: 'pnpm',
    args: Object.freeze(['lint']),
    windowsCommand: 'pnpm lint',
    cwd: 'server',
    packageScope: 'server',
  }),
  'server-test': Object.freeze({
    id: 'server-test',
    command: 'pnpm',
    args: Object.freeze(['test', '--', '--run']),
    windowsCommand: 'pnpm test -- --run',
    cwd: 'server',
    packageScope: 'server',
  }),
  'server-build': Object.freeze({
    id: 'server-build',
    command: 'pnpm',
    args: Object.freeze(['run', 'vercel-build']),
    windowsCommand: 'pnpm run vercel-build',
    cwd: 'server/api',
    packageScope: 'server',
  }),
});

const COMMAND_IDS = new Set(Object.keys(COMMAND_REGISTRY));
const OUTPUT_REDACTIONS = Object.freeze([
  [/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|$)/gi, '[REDACTED PRIVATE KEY]'],
  [/\b(authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+[^\s,;]+/gi, '$1: [REDACTED]'],
  [/\b(cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, '$1: [REDACTED]'],
  [/\b([A-Z0-9_.-]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL|ACCESS[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_.-]*\b\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, '$1[REDACTED]'],
  [/\b(mysql|mariadb|postgres(?:ql)?|redis):\/\/[^\s:@/]+:[^\s@/]+@/gi, '$1://[REDACTED]@'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED TOKEN]'],
]);

export class VerificationPlanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VerificationPlanError';
  }
}

export class VerificationExecutionRefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VerificationExecutionRefusedError';
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function toPlanCommand(id) {
  const entry = COMMAND_REGISTRY[id];
  return {
    id: entry.id,
    command: entry.command,
    args: [...entry.args],
    cwd: entry.cwd,
  };
}

function isDatabaseRelatedPath(normalizedPath) {
  return normalizedPath.startsWith('server/src/database/')
    || normalizedPath === 'server/prisma.config.ts'
    || normalizedPath.startsWith('server/prisma/');
}

function externalChecksFor({ mode, touchesClient, touchesServer }) {
  if (mode !== 'full') return [];

  const checks = ['github-ci', 'dependency-review', 'codeql'];
  if (touchesClient) checks.push('client-preview-smoke');
  if (touchesServer) {
    checks.push('server-mysql-integration', 'server-legacy-baseline-demo-reset', 'server-health-smoke');
  }
  return checks;
}

export function buildVerificationPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new VerificationPlanError('verification plan input must be an object');
  }
  if (input.mode !== 'fast' && input.mode !== 'full') {
    throw new VerificationPlanError('mode must be fast or full');
  }
  if (!Array.isArray(input.changedPaths)) {
    throw new VerificationPlanError('changedPaths must be an array');
  }

  const changedPaths = [...new Set(input.changedPaths.map(normalizeRepoPath))].sort();
  const risk = classifyRisk({ paths: changedPaths }, input.policy);
  const touchesClient = changedPaths.some((changedPath) => changedPath === 'client' || changedPath.startsWith('client/'));
  const touchesServer = changedPaths.some((changedPath) => changedPath === 'server' || changedPath.startsWith('server/'));
  const selected = ['loop-tests'];

  if (touchesClient) {
    selected.push('client-typecheck', 'client-lint', 'client-test');
    if (input.mode === 'full') selected.push('client-build');
  }

  if (touchesServer) {
    if (input.mode === 'full' || changedPaths.some(isDatabaseRelatedPath)) {
      selected.push('server-prisma-validate');
    }
    selected.push('server-typecheck', 'server-lint', 'server-test');
    if (input.mode === 'full') selected.push('server-build');
  }

  const requiredExternalChecks = externalChecksFor({ mode: input.mode, touchesClient, touchesServer });
  return deepFreeze({
    schemaVersion: 1,
    mode: input.mode,
    changedPaths,
    risk,
    commands: selected.map(toPlanCommand),
    requiredExternalChecks,
    complete: requiredExternalChecks.length === 0,
  });
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateMaxOutputBytes(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_OUTPUT_BYTES) {
    throw new VerificationPlanError(`maxOutputBytes must be between 1 and ${MAX_OUTPUT_BYTES}`);
  }
}

export function buildSpawnSpec(commandId, { platform = process.platform, systemRoot = process.env.SystemRoot } = {}) {
  if (!COMMAND_IDS.has(commandId)) throw new VerificationPlanError(`command ID is not allowlisted: ${commandId}`);
  const entry = COMMAND_REGISTRY[commandId];

  if (platform === 'win32') {
    if (typeof systemRoot !== 'string' || !path.win32.isAbsolute(systemRoot)) {
      throw new VerificationPlanError('Windows SystemRoot must be an absolute path');
    }
    return {
      file: path.win32.join(systemRoot, 'System32', 'cmd.exe'),
      args: ['/d', '/s', '/c', entry.windowsCommand],
    };
  }
  if (!['linux', 'darwin', 'freebsd', 'openbsd', 'sunos', 'aix', 'posix'].includes(platform)) {
    throw new VerificationPlanError(`unsupported process platform: ${platform}`);
  }
  return { file: entry.command, args: [...entry.args] };
}

export function redactVerificationOutput(text) {
  if (typeof text !== 'string') throw new TypeError('verification output must be a string');
  return OUTPUT_REDACTIONS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

function captureStream(stream, maxBytes) {
  const chunks = [];
  let byteCount = 0;
  let truncated = false;

  stream.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = maxBytes - byteCount;
    if (remaining > 0) {
      const retained = buffer.subarray(0, remaining);
      chunks.push(retained);
      byteCount += retained.length;
    }
    if (buffer.length > Math.max(remaining, 0)) truncated = true;
  });

  return () => {
    const originalText = Buffer.concat(chunks).toString('utf8');
    const redacted = redactVerificationOutput(originalText);
    const redactedBuffer = Buffer.from(redacted, 'utf8');
    const finalTruncated = truncated || redactedBuffer.length > maxBytes;
    return {
      text: redactedBuffer.subarray(0, maxBytes).toString('utf8'),
      truncated: finalTruncated,
    };
  };
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function readGitHeadRevision(repoRoot) {
  repoRoot = await resolveRepositoryRoot(repoRoot);
  const env = { PATH: process.env.PATH ?? '' };
  for (const key of ['SystemRoot', 'WINDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }

  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      env,
      maxBuffer: 4096,
      timeout: 5000,
      windowsHide: true,
    });
    const revision = stdout.trim();
    if (!GIT_REVISION_PATTERN.test(revision)) throw new Error('invalid Git revision');
    return revision.toLowerCase();
  } catch {
    throw new VerificationExecutionRefusedError('could not inspect the current Git revision for verification');
  }
}

export async function readGitWorkspaceFingerprint(repoRoot) {
  repoRoot = await resolveRepositoryRoot(repoRoot);
  const env = { PATH: process.env.PATH ?? '', GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['SystemRoot', 'WINDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }

  try {
    const [index, status] = await Promise.all([
      execFileAsync('git', ['-C', repoRoot, 'ls-files', '--stage', '-z'], {
        encoding: null,
        env,
        maxBuffer: MAX_GIT_SNAPSHOT_METADATA_BYTES,
        timeout: 5000,
        windowsHide: true,
      }).then(({ stdout }) => stdout),
      execFileAsync('git', [
        '-C', repoRoot,
        '-c', 'core.fsmonitor=false',
        '-c', 'core.untrackedCache=false',
        'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--ignore-submodules=none',
      ], {
        encoding: null,
        env,
        maxBuffer: MAX_GIT_SNAPSHOT_METADATA_BYTES,
        timeout: 5000,
        windowsHide: true,
      }).then(({ stdout }) => stdout),
    ]);

    if (!Buffer.isBuffer(index) || !Buffer.isBuffer(status)) throw new Error('invalid Git metadata');
    const fingerprint = createHash('sha256');
    // The index records staged blobs; status plus changed-file contents captures the checked-out worktree.
    fingerprint.update('index\0');
    fingerprint.update(index);
    fingerprint.update('status\0');
    fingerprint.update(status);

    let totalFileBytes = 0;
    let offset = 0;
    while (offset < status.length) {
      const separator = status.indexOf(0, offset);
      if (separator < 0) throw new Error('unterminated Git status entry');
      const entry = status.subarray(offset, separator);
      offset = separator + 1;
      if (entry.length === 0) continue;
      if (entry.length < 4 || entry[2] !== 0x20) throw new Error('invalid Git status entry');

      const rawPath = entry.subarray(3);
      const displayPath = rawPath.toString('utf8');
      if (!Buffer.from(displayPath, 'utf8').equals(rawPath)) throw new Error('Git path is not valid UTF-8');
      const normalizedPath = normalizeRepoPath(displayPath);
      const candidate = path.resolve(repoRoot, ...normalizedPath.split('/'));
      if (!isPathInside(repoRoot, candidate)) throw new Error('Git path escapes the repository');
      fingerprint.update('path\0');
      fingerprint.update(rawPath);
      fingerprint.update('\0');

      let info;
      try {
        info = await lstat(candidate);
      } catch (error) {
        if (error.code === 'ENOENT') {
          fingerprint.update('missing\0');
          continue;
        }
        throw error;
      }

      const realParent = await realpath(path.dirname(candidate));
      if (!isPathInside(repoRoot, realParent)) throw new Error('Git path resolves outside the repository');
      fingerprint.update(`mode:${(info.mode & 0o7777).toString(8)}\0`);

      let contents;
      if (info.isSymbolicLink()) {
        contents = await readlink(candidate, { encoding: 'buffer' });
        fingerprint.update('symlink\0');
      } else if (info.isFile()) {
        if (totalFileBytes + info.size > MAX_GIT_SNAPSHOT_FILE_BYTES) throw new Error('changed files exceed the snapshot limit');
        contents = await readFile(candidate);
        totalFileBytes += contents.byteLength;
        if (totalFileBytes > MAX_GIT_SNAPSHOT_FILE_BYTES) throw new Error('changed files exceed the snapshot limit');
        fingerprint.update('file\0');
      } else {
        throw new Error('changed directory or submodule cannot be fingerprinted safely');
      }
      fingerprint.update(contents);
      fingerprint.update('\0');
    }

    return fingerprint.digest('hex');
  } catch {
    throw new VerificationExecutionRefusedError('could not capture a bounded, repository-contained Git working-tree snapshot');
  }
}

async function resolveRepositoryRoot(repoRoot) {
  let realRoot;
  try {
    realRoot = await realpath(path.resolve(repoRoot ?? REPOSITORY_ROOT));
  } catch (error) {
    throw new VerificationExecutionRefusedError(`repository root is unavailable: ${error.code ?? 'path_error'}`);
  }

  const gitPath = path.join(realRoot, '.git');
  let gitInfo;
  try {
    gitInfo = await lstat(gitPath);
  } catch {
    throw new VerificationExecutionRefusedError('verification requires a Git checkout');
  }
  if (gitInfo.isSymbolicLink() || (!gitInfo.isDirectory() && !gitInfo.isFile())) {
    throw new VerificationExecutionRefusedError('Git metadata path must be a regular file or directory');
  }
  return realRoot;
}

async function resolvePackageRoot(repoRoot, packageName) {
  const relative = packageName === 'client' ? 'client' : 'server';
  const expected = path.resolve(repoRoot, relative);
  let current = repoRoot;

  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch((error) => {
      throw new VerificationExecutionRefusedError(`required package directory is unavailable: ${relative} (${error.code ?? 'path_error'})`);
    });
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new VerificationExecutionRefusedError(`package path must not be a symlink: ${relative}`);
    }
  }

  const realPackageRoot = await realpath(expected);
  if (!isPathInside(repoRoot, realPackageRoot) || realPackageRoot !== expected) {
    throw new VerificationExecutionRefusedError(`package path escapes repository root: ${relative}`);
  }

  const packageManifest = path.join(realPackageRoot, 'package.json');
  const manifestInfo = await lstat(packageManifest).catch((error) => {
    throw new VerificationExecutionRefusedError(`package manifest is unavailable: ${relative}/package.json (${error.code ?? 'path_error'})`);
  });
  if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile()) {
    throw new VerificationExecutionRefusedError(`package manifest must be a regular file: ${relative}/package.json`);
  }
  return realPackageRoot;
}

async function resolveCommandCwd(repoRoot, command) {
  if (command.cwd === '.') return repoRoot;
  const candidate = path.resolve(repoRoot, command.cwd);
  if (!isPathInside(repoRoot, candidate)) {
    throw new VerificationExecutionRefusedError(`command working directory escapes repository root: ${command.id}`);
  }

  const segments = command.cwd.split('/');
  let current = repoRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = await lstat(current).catch((error) => {
      throw new VerificationExecutionRefusedError(`command working directory is unavailable: ${command.id} (${error.code ?? 'path_error'})`);
    });
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new VerificationExecutionRefusedError(`command working directory must not be a symlink: ${command.id}`);
    }
  }

  const realCwd = await realpath(candidate);
  if (!isPathInside(repoRoot, realCwd) || realCwd !== candidate) {
    throw new VerificationExecutionRefusedError(`command working directory escapes repository root: ${command.id}`);
  }
  return realCwd;
}

function isRealDotenvFilename(filename) {
  const normalizedFilename = filename.toLowerCase();
  return (normalizedFilename === '.env' || normalizedFilename.startsWith('.env.'))
    && !normalizedFilename.endsWith('.example');
}

async function findRealDotenvFiles(directories) {
  const found = [];
  for (const directory of new Set(directories)) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (isRealDotenvFilename(entry.name) && (entry.isFile() || entry.isSymbolicLink())) {
        found.push(path.relative(path.dirname(directory), path.join(directory, entry.name)).replaceAll('\\', '/'));
      }
    }
  }
  return found;
}

async function assertNoCredentialFiles(repoRoot, packageRoots) {
  const envFiles = await findRealDotenvFiles([repoRoot, ...packageRoots.values()]);
  if (envFiles.length > 0) {
    throw new VerificationExecutionRefusedError('package execution refused because real dotenv files exist in the selected checkout');
  }
}

async function assertSafeNpmConfiguration(repoRoot, packageRoots, commands) {
  const directories = new Set([
    repoRoot,
    ...packageRoots.values(),
    ...commands.map((command) => path.resolve(repoRoot, command.cwd)),
  ]);

  for (const directory of directories) {
    const npmrcPath = path.join(directory, '.npmrc');
    const info = await lstat(npmrcPath).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw new VerificationExecutionRefusedError(`could not inspect npm configuration in ${path.relative(repoRoot, directory) || '.'}`);
    });
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new VerificationExecutionRefusedError('package execution refused because project npm configuration is not a regular file');
    }

    let contents;
    try {
      contents = await readFile(npmrcPath, 'utf8');
    } catch {
      throw new VerificationExecutionRefusedError('could not inspect project npm configuration');
    }
    if (NPMRC_AUTH_SETTING.test(contents)) {
      throw new VerificationExecutionRefusedError('package execution refused because project npm configuration contains authentication settings');
    }
  }
}

async function buildSanitizedPath(repoRoot, scratchRoot, systemRoot) {
  const delimiter = path.delimiter;
  const candidates = [path.dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)];
  if (process.platform === 'win32' && systemRoot) candidates.unshift(path.win32.join(systemRoot, 'System32'));

  const accepted = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const absolute = path.resolve(candidate.replace(/^"|"$/g, ''));
    let realDirectory;
    try {
      realDirectory = await realpath(absolute);
      const info = await stat(realDirectory);
      if (!info.isDirectory()) continue;
    } catch {
      continue;
    }
    if (isPathInside(repoRoot, realDirectory) || isPathInside(scratchRoot, realDirectory)) continue;
    const identity = process.platform === 'win32' ? realDirectory.toLowerCase() : realDirectory;
    if (!seen.has(identity)) {
      accepted.push(realDirectory);
      seen.add(identity);
    }
  }
  return accepted.join(delimiter);
}

async function createChildEnvironment(repoRoot) {
  const scratchRoot = await mkdtemp(path.join(os.tmpdir(), 'digital-e-loop-verify-'));
  const isolated = Object.fromEntries([
    'home', 'appdata', 'localappdata', 'temp', 'config', 'cache', 'corepack',
  ].map((name) => [name, path.join(scratchRoot, name)]));
  for (const directory of Object.values(isolated)) await mkdir(directory, { recursive: true });

  const safeDotenvPath = path.join(scratchRoot, 'empty.env');
  const safeNpmConfigPath = path.join(scratchRoot, 'empty.npmrc');
  await writeFile(safeDotenvPath, '', 'utf8');
  await writeFile(safeNpmConfigPath, '', 'utf8');

  const systemRoot = process.platform === 'win32' ? (process.env.SystemRoot ?? process.env.WINDIR) : undefined;
  const safePath = await buildSanitizedPath(repoRoot, scratchRoot, systemRoot);
  const env = {
    CI: 'true',
    NODE_ENV: 'test',
    PATH: safePath,
    HOME: isolated.home,
    USERPROFILE: isolated.home,
    APPDATA: isolated.appdata,
    LOCALAPPDATA: isolated.localappdata,
    TEMP: isolated.temp,
    TMP: isolated.temp,
    TMPDIR: isolated.temp,
    XDG_CONFIG_HOME: isolated.config,
    XDG_CACHE_HOME: isolated.cache,
    COREPACK_HOME: isolated.corepack,
    DOTENV_CONFIG_PATH: safeDotenvPath,
    npm_config_userconfig: safeNpmConfigPath,
  };

  if (process.platform === 'win32') {
    if (typeof systemRoot !== 'string' || !path.win32.isAbsolute(systemRoot)) {
      await rm(scratchRoot, { recursive: true, force: true });
      throw new VerificationExecutionRefusedError('Windows SystemRoot is required for isolated command execution');
    }
    env.SystemRoot = systemRoot;
    env.ComSpec = path.win32.join(systemRoot, 'System32', 'cmd.exe');
  }

  return { scratchRoot, env };
}

function captureForCommand(child, maxOutputBytes) {
  const stdout = captureStream(child.stdout, maxOutputBytes);
  const stderr = captureStream(child.stderr, maxOutputBytes);
  return () => ({ stdout: stdout(), stderr: stderr() });
}

function runSpawn({ spawnImpl, spec, command, cwd, env, maxOutputBytes }) {
  const startedAt = Date.now();
  let child;
  try {
    child = spawnImpl(spec.file, spec.args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return Promise.resolve({
      id: command.id,
      exitCode: null,
      signal: null,
      durationMs: Date.now() - startedAt,
      stdout: '',
      stdoutTruncated: false,
      stderr: '',
      stderrTruncated: false,
      spawnErrorCode: /^[A-Z0-9_]+$/i.test(error?.code ?? '') ? error.code : 'SPAWN_FAILED',
    });
  }

  const getOutput = captureForCommand(child, maxOutputBytes);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode, signal, spawnErrorCode = null) => {
      if (settled) return;
      settled = true;
      const output = getOutput();
      resolve({
        id: command.id,
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        stdout: output.stdout.text,
        stdoutTruncated: output.stdout.truncated,
        stderr: output.stderr.text,
        stderrTruncated: output.stderr.truncated,
        spawnErrorCode,
      });
    };

    child.once('error', (error) => {
      const code = /^[A-Z0-9_]+$/i.test(error?.code ?? '') ? error.code : 'SPAWN_FAILED';
      finish(null, null, code);
    });
    child.once('close', (exitCode, signal) => finish(exitCode, signal));
  });
}

function validateRunOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new VerificationPlanError('runner options must be an object');
  }
  const allowed = new Set(['repoRoot', 'maxOutputBytes', 'spawnImpl']);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new VerificationPlanError(`unsupported runner option(s): ${unknown.join(', ')}`);
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  validateMaxOutputBytes(maxOutputBytes);
  if (options.spawnImpl !== undefined && typeof options.spawnImpl !== 'function') {
    throw new VerificationPlanError('spawnImpl must be a function');
  }
  return { maxOutputBytes, spawnImpl: options.spawnImpl ?? spawn };
}

export async function runVerificationPlan(plan, options = {}) {
  const { maxOutputBytes, spawnImpl } = validateRunOptions(options);
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new VerificationPlanError('a built VerificationPlan is required');
  }

  const repoRoot = await resolveRepositoryRoot(options.repoRoot ?? REPOSITORY_ROOT);
  const policy = await loadLoopPolicy(repoRoot);
  let expectedPlan;
  try {
    expectedPlan = buildVerificationPlan({ changedPaths: plan.changedPaths, mode: plan.mode, policy });
  } catch (error) {
    throw new VerificationPlanError(`verification plan cannot be rebuilt: ${error.message}`);
  }
  if (stableSerialize(plan) !== stableSerialize(expectedPlan)) {
    throw new VerificationPlanError('verification plan does not match the fixed plan and command registry');
  }

  const packageRoots = new Map();
  for (const command of expectedPlan.commands) {
    const entry = COMMAND_REGISTRY[command.id];
    if (entry.packageScope && !packageRoots.has(entry.packageScope)) {
      packageRoots.set(entry.packageScope, await resolvePackageRoot(repoRoot, entry.packageScope));
    }
    await resolveCommandCwd(repoRoot, command);
  }
  await assertNoCredentialFiles(repoRoot, packageRoots);
  await assertSafeNpmConfiguration(repoRoot, packageRoots, expectedPlan.commands);
  const verifiedRevision = await readGitHeadRevision(repoRoot);
  const verifiedWorkspaceFingerprint = await readGitWorkspaceFingerprint(repoRoot);

  let childEnvironment;
  try {
    childEnvironment = await createChildEnvironment(repoRoot);
  } catch (error) {
    if (error instanceof VerificationExecutionRefusedError) throw error;
    throw new VerificationExecutionRefusedError(`could not isolate verification environment: ${error.code ?? 'temp_error'}`);
  }

  const results = [];
  try {
    for (const command of expectedPlan.commands) {
      const entry = COMMAND_REGISTRY[command.id];
      const cwd = await resolveCommandCwd(repoRoot, command);
      const spec = buildSpawnSpec(command.id);
      results.push(await runSpawn({
        spawnImpl,
        spec,
        command,
        cwd,
        env: childEnvironment.env,
        maxOutputBytes,
      }));
    }
  } finally {
    const resolvedScratch = await realpath(childEnvironment.scratchRoot).catch(() => null);
    if (resolvedScratch && path.dirname(resolvedScratch) === await realpath(os.tmpdir())) {
      await rm(resolvedScratch, { recursive: true, force: true });
    }
  }

  const passed = results.length === expectedPlan.commands.length
    && results.every((result) => result.exitCode === 0 && result.signal === null && result.spawnErrorCode === null);
  const commandsCompleted = results.length === expectedPlan.commands.length
    && results.every((result) => Number.isSafeInteger(result.exitCode) && result.signal === null && result.spawnErrorCode === null);
  const currentRevision = await readGitHeadRevision(repoRoot);
  const currentWorkspaceFingerprint = await readGitWorkspaceFingerprint(repoRoot);
  const revisionStable = verifiedRevision === currentRevision;
  const workspaceStable = verifiedWorkspaceFingerprint === currentWorkspaceFingerprint;

  return {
    schemaVersion: 1,
    mode: expectedPlan.mode,
    risk: expectedPlan.risk,
    passed,
    complete: commandsCompleted && expectedPlan.requiredExternalChecks.length === 0 && revisionStable && workspaceStable,
    verifiedRevision,
    currentRevision,
    revisionStable,
    verifiedWorkspaceFingerprint,
    currentWorkspaceFingerprint,
    workspaceStable,
    commands: results,
    requiredExternalChecks: [...expectedPlan.requiredExternalChecks],
  };
}

function parseCliArguments(argv) {
  let mode;
  let dryRun = false;
  const changedPaths = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      dryRun = true;
    } else if (argument === '--mode') {
      mode = argv[++index];
    } else if (argument === '--changed') {
      const changedPath = argv[++index];
      if (changedPath === undefined || changedPath.startsWith('--')) {
        throw new VerificationPlanError('--changed requires a path value');
      }
      changedPaths.push(changedPath);
    } else {
      throw new VerificationPlanError(`unknown argument: ${argument}`);
    }
  }

  if (!mode || changedPaths.length === 0) {
    throw new VerificationPlanError('usage: node scripts/loop/verify.mjs [--dry-run] --mode fast|full --changed <path> [--changed <path> ...]');
  }
  return { mode, dryRun, changedPaths };
}

async function runCli(argv) {
  const { mode, dryRun, changedPaths } = parseCliArguments(argv);
  const policy = await loadLoopPolicy(REPOSITORY_ROOT);
  const plan = buildVerificationPlan({ changedPaths, mode, policy });
  if (dryRun) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }

  const result = await runVerificationPlan(plan, { repoRoot: REPOSITORY_ROOT });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.passed && result.complete ? 0 : 1;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  runCli(process.argv.slice(2))
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      const safeMessage = String(error?.message ?? error).replace(/[\u0000-\u001f\u007f]/g, ' ');
      process.stderr.write(`${error?.name ?? 'Error'}: ${safeMessage}\n`);
      process.exitCode = 1;
    });
}
