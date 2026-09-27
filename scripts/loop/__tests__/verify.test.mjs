import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLoopPolicy } from '../policy.mjs';
import {
  VerificationExecutionRefusedError,
  buildSpawnSpec,
  buildVerificationPlan,
  redactVerificationOutput,
  runVerificationPlan,
} from '../verify.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryRoots = new Set();
const policyFiles = ['protected-paths.yml', 'risk-rules.yml', 'stop-conditions.yml'];
let policy;

before(async () => {
  policy = await loadLoopPolicy(repoRoot);
});

async function createRepoFixture({ dotenv = [], npmrc = [] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-verify-'));
  temporaryRoots.add(root);
  await mkdir(path.join(root, '.git'));
  await mkdir(path.join(root, '.agent', 'policy'), { recursive: true });
  await mkdir(path.join(root, 'client'), { recursive: true });
  await mkdir(path.join(root, 'server', 'api'), { recursive: true });
  await writeFile(path.join(root, 'client', 'package.json'), '{"name":"fixture-client"}', 'utf8');
  await writeFile(path.join(root, 'server', 'package.json'), '{"name":"fixture-server"}', 'utf8');
  await writeFile(path.join(root, 'server', 'api', 'package.json'), '{"name":"fixture-server-api"}', 'utf8');

  for (const filename of policyFiles) {
    const contents = await readFile(path.join(repoRoot, '.agent', 'policy', filename), 'utf8');
    await writeFile(path.join(root, '.agent', 'policy', filename), contents, 'utf8');
  }
  for (const relativePath of dotenv) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '', 'utf8');
  }
  for (const [relativePath, contents] of npmrc) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }

  return root;
}

function fakeSpawnFactory({ stdout = '', stderr = '', exitCode = 0 } = {}) {
  const calls = [];
  const spawnImpl = (file, args, options) => {
    const dotenvContents = readFileSync(options.env.DOTENV_CONFIG_PATH, 'utf8');
    calls.push({ file, args, options, dotenvContents });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    setImmediate(() => {
      child.stdout.end(stdout);
      child.stderr.end(stderr);
      setImmediate(() => child.emit('close', exitCode, null));
    });
    return child;
  };
  return { calls, spawnImpl };
}

function commandIds(plan) {
  return plan.commands.map(({ id }) => id);
}

afterEach(async () => {
  const roots = [...temporaryRoots];
  temporaryRoots.clear();
  const tempDirectory = await realpath(os.tmpdir());

  for (const root of roots) {
    const resolved = await realpath(root);
    assert.equal(path.dirname(resolved), tempDirectory);
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('verification planning', () => {
  it('routes documentation and policy changes only to the control-plane test suite', () => {
    const plan = buildVerificationPlan({ changedPaths: ['docs/ARCHITECTURE.md', '.agent/policy/risk-rules.yml'], mode: 'fast', policy });

    assert.deepEqual(commandIds(plan), ['loop-tests']);
    assert.equal(plan.risk.level, 'high');
    assert.deepEqual(plan.requiredExternalChecks, []);
    assert.deepEqual(plan.commands[0].args.slice(1), [
      'scripts/loop/__tests__/policy.test.mjs',
      'scripts/loop/__tests__/classify-risk.test.mjs',
      'scripts/loop/__tests__/fingerprint-failure.test.mjs',
      'scripts/loop/__tests__/state.test.mjs',
      'scripts/loop/__tests__/classify-failure.test.mjs',
      'scripts/loop/__tests__/controller.test.mjs',
      'scripts/loop/__tests__/contracts.test.mjs',
      'scripts/loop/__tests__/verify.test.mjs',
      'scripts/loop/__tests__/workflow.test.mjs',
    ]);
  });

  it('routes client fast/full work to client checks only and leaves preview smoke external', () => {
    const changedPaths = ['client/src/features/products/ProductCard.tsx'];
    const fastPlan = buildVerificationPlan({ changedPaths, mode: 'fast', policy });
    const fullPlan = buildVerificationPlan({ changedPaths, mode: 'full', policy });

    assert.deepEqual(commandIds(fastPlan), ['loop-tests', 'client-typecheck', 'client-lint', 'client-test']);
    assert.deepEqual(commandIds(fullPlan), [...commandIds(fastPlan), 'client-build']);
    assert.deepEqual(fullPlan.requiredExternalChecks, ['github-ci', 'dependency-review', 'codeql', 'client-preview-smoke']);
  });

  it('routes server fast/full work, requires Prisma validation for database paths, and keeps CI-only work external', () => {
    const ordinaryFast = buildVerificationPlan({
      changedPaths: ['server/src/catalog/catalog.service.ts'],
      mode: 'fast',
      policy,
    });
    const databaseFast = buildVerificationPlan({
      changedPaths: ['server/src/database/prisma/client.ts'],
      mode: 'fast',
      policy,
    });
    const fullPlan = buildVerificationPlan({
      changedPaths: ['server/src/orders/orders.service.ts'],
      mode: 'full',
      policy,
    });

    assert.deepEqual(commandIds(ordinaryFast), ['loop-tests', 'server-typecheck', 'server-lint', 'server-test']);
    assert.deepEqual(commandIds(databaseFast), [
      'loop-tests', 'server-prisma-validate', 'server-typecheck', 'server-lint', 'server-test',
    ]);
    assert.deepEqual(commandIds(fullPlan), [
      'loop-tests', 'server-prisma-validate', 'server-typecheck', 'server-lint', 'server-test', 'server-build',
    ]);
    assert.deepEqual(fullPlan.requiredExternalChecks, [
      'github-ci', 'dependency-review', 'codeql',
      'server-mysql-integration', 'server-legacy-baseline-demo-reset', 'server-health-smoke',
    ]);
    assert.equal(fullPlan.complete, false);
    assert.equal(commandIds(fullPlan).some((id) => id.includes('integration') || id.includes('migration') || id.includes('seed')), false);
  });

  it('combines mixed package plans and keeps hostile changed paths out of every command field', () => {
    const hostilePath = 'client/src/quote"; rm -rf .; `whoami`.tsx';
    const plan = buildVerificationPlan({
      changedPaths: [hostilePath, 'server/src/catalog/catalog.service.ts'],
      mode: 'fast',
      policy,
    });
    const serializedCommands = JSON.stringify(plan.commands);

    assert.deepEqual(commandIds(plan), [
      'loop-tests', 'client-typecheck', 'client-lint', 'client-test',
      'server-typecheck', 'server-lint', 'server-test',
    ]);
    assert.equal(serializedCommands.includes(hostilePath), false);
    assert.ok(plan.changedPaths.includes(hostilePath));
  });

  it('rejects path traversal and emits only registry-owned command IDs and argument vectors', () => {
    assert.throws(() => buildVerificationPlan({ changedPaths: ['../outside.ts'], mode: 'fast', policy }), /traversal/);

    const plan = buildVerificationPlan({
      changedPaths: ['client/src/App.tsx', 'server/src/catalog/catalog.service.ts'],
      mode: 'full',
      policy,
    });
    const commandIdsSeen = new Set();
    for (const command of plan.commands) {
      assert.equal(commandIdsSeen.has(command.id), false);
      commandIdsSeen.add(command.id);
      assert.ok(['node', 'pnpm'].includes(command.command));
      assert.ok(Array.isArray(command.args));
      assert.ok(['.', 'client', 'server', 'server/api'].includes(command.cwd));
    }
  });
});

describe('verification execution safety', () => {
  it('builds static Windows and POSIX spawn invocations from registry IDs', () => {
    const windows = buildSpawnSpec('client-typecheck', { platform: 'win32', systemRoot: 'C:\\Windows' });
    const posix = buildSpawnSpec('client-typecheck', { platform: 'linux' });

    assert.deepEqual(windows, {
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm exec tsc -p tsconfig.json --noEmit'],
    });
    assert.deepEqual(posix, {
      file: 'pnpm',
      args: ['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'],
    });
    assert.throws(() => buildSpawnSpec('not-registered'), /not allowlisted/);
  });

  it('uses shell:false, a minimal environment, isolated temp paths, and the safe empty dotenv file', async () => {
    const root = await createRepoFixture();
    const plan = buildVerificationPlan({ changedPaths: ['client/src/App.tsx'], mode: 'fast', policy });
    const { calls, spawnImpl } = fakeSpawnFactory();
    const previousValues = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_PASSWORD: process.env.DB_PASSWORD,
      JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    };

    try {
      process.env.DATABASE_URL = 'do-not-inherit-db-url';
      process.env.DB_PASSWORD = 'do-not-inherit-db-password';
      process.env.JWT_SECRET_KEY = 'do-not-inherit-jwt';
      process.env.FIREBASE_PRIVATE_KEY = 'do-not-inherit-firebase';
      process.env.GITHUB_TOKEN = 'do-not-inherit-github';

      const result = await runVerificationPlan(plan, { repoRoot: root, spawnImpl });

      assert.equal(result.passed, true);
      assert.equal(result.complete, true);
      assert.equal(calls.length, plan.commands.length);
      for (const [index, { options, dotenvContents }] of calls.entries()) {
        assert.equal(options.shell, false);
        assert.equal(options.cwd, index === 0 ? root : path.join(root, 'client'));
        for (const forbidden of ['DATABASE_URL', 'DB_PASSWORD', 'JWT_SECRET_KEY', 'FIREBASE_PRIVATE_KEY', 'GITHUB_TOKEN']) {
          assert.equal(Object.hasOwn(options.env, forbidden), false);
        }
        assert.equal(dotenvContents, '');
        for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR']) {
          if (options.env[key]) assert.equal(options.env[key].startsWith(os.tmpdir()), true);
        }
      }
    } finally {
      for (const [key, value] of Object.entries(previousValues)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('refuses package execution when real dotenv files exist, before spawning any command', async () => {
    const root = await createRepoFixture({ dotenv: ['client/.env.production'] });
    const plan = buildVerificationPlan({ changedPaths: ['client/src/App.tsx'], mode: 'fast', policy });
    const { calls, spawnImpl } = fakeSpawnFactory();

    await assert.rejects(
      runVerificationPlan(plan, { repoRoot: root, spawnImpl }),
      VerificationExecutionRefusedError,
    );
    assert.equal(calls.length, 0);
  });

  it('refuses project npm authentication settings without including their values in the error', async () => {
    const secret = 'do-not-leak-this-token';
    const root = await createRepoFixture({
      npmrc: [['client/.npmrc', `//registry.example/:_authToken=${secret}\n`]],
    });
    const plan = buildVerificationPlan({ changedPaths: ['client/src/App.tsx'], mode: 'fast', policy });
    const { calls, spawnImpl } = fakeSpawnFactory();

    await assert.rejects(
      runVerificationPlan(plan, { repoRoot: root, spawnImpl }),
      (error) => {
        assert.ok(error instanceof VerificationExecutionRefusedError);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
    assert.equal(calls.length, 0);
  });

  it('keeps full-mode local success incomplete while required external CI checks remain', async () => {
    const root = await createRepoFixture();
    const plan = buildVerificationPlan({ changedPaths: ['client/src/App.tsx'], mode: 'full', policy });
    const { spawnImpl } = fakeSpawnFactory();
    const result = await runVerificationPlan(plan, { repoRoot: root, spawnImpl });

    assert.equal(result.passed, true);
    assert.equal(result.complete, false);
    assert.deepEqual(result.requiredExternalChecks, plan.requiredExternalChecks);
  });

  it('rejects a tampered plan before invoking a process', async () => {
    const root = await createRepoFixture();
    const plan = structuredClone(buildVerificationPlan({ changedPaths: ['client/src/App.tsx'], mode: 'fast', policy }));
    plan.commands[1].args.push('; echo unsafe');
    const { calls, spawnImpl } = fakeSpawnFactory();

    await assert.rejects(runVerificationPlan(plan, { repoRoot: root, spawnImpl }), /does not match the fixed plan/);
    assert.equal(calls.length, 0);
  });

  it('redacts sensitive headers, URL credentials, assignments, and common token formats', () => {
    const output = redactVerificationOutput([
      'Authorization: Bearer header-secret',
      'Cookie: session=cookie-secret; refresh=also-secret',
      'JWT_SECRET_KEY=jwt-secret',
      'DATABASE_URL=mysql://user:db-secret@localhost:3306/shop',
      'VITE_SERVICE_API_KEY="api-secret" ACCESS_TOKEN=token-secret',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    ].join('\n'));

    for (const secret of ['header-secret', 'cookie-secret', 'also-secret', 'jwt-secret', 'db-secret', 'api-secret', 'token-secret', 'ghp_']) {
      assert.equal(output.includes(secret), false, `secret leaked: ${secret}`);
    }
    assert.match(output, /\[REDACTED\]/);
  });

  it('bounds retained stdout/stderr without changing process pass/fail status', async () => {
    const root = await createRepoFixture();
    const plan = buildVerificationPlan({ changedPaths: ['client/src/App.tsx'], mode: 'fast', policy });
    const { spawnImpl } = fakeSpawnFactory({ stdout: 'o'.repeat(4096), stderr: 'e'.repeat(4096), exitCode: 1 });
    const result = await runVerificationPlan(plan, { repoRoot: root, maxOutputBytes: 64, spawnImpl });

    assert.equal(result.passed, false);
    assert.equal(result.complete, true);
    for (const command of result.commands) {
      assert.equal(Buffer.byteLength(command.stdout, 'utf8') <= 64, true);
      assert.equal(Buffer.byteLength(command.stderr, 'utf8') <= 64, true);
      assert.equal(command.stdoutTruncated, true);
      assert.equal(command.stderrTruncated, true);
      assert.equal(command.exitCode, 1);
    }
  });
});
