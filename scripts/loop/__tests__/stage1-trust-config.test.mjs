import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';

import { loadStage1TrustConfig, parseStage1TrustConfig, stage1TrustConfigPath, STAGE1_TRUST_CONFIG_RELATIVE_PATH } from '../stage1-trust-config.mjs';

const config = { schemaVersion: 1, repositoryId: 743050379, trustedApproverIds: [1001],
  workflowActorId: 9988, workflowActorLogin: 'digital-e-loop-runner[bot]' };

it('parses a strict repository-scoped local trust configuration with numeric identities', () => {
  const parsed = parseStage1TrustConfig(config);
  assert.deepEqual(parsed, config);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.trustedApproverIds), true);
  for (const invalid of [
    { ...config, repositoryId: 1 },
    { ...config, trustedApproverIds: ['1001'] },
    { ...config, trustedApproverIds: [1001, 1001] },
    { ...config, workflowActorLogin: 'untrusted[bot]' },
    { ...config, extra: true },
  ]) assert.throws(() => parseStage1TrustConfig(invalid));
});

it('loads only the fixed user-local path and rejects missing, symlinked, or permissive config files', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'stage1-trust-config-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const configPath = stage1TrustConfigPath(home);
  await assert.rejects(loadStage1TrustConfig({ homeDirectory: home }), { reasonCode: 'stage1_trust_configuration_unavailable' });
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  assert.deepEqual(await loadStage1TrustConfig({ homeDirectory: home }), config);
  const link = path.join(path.dirname(configPath), 'link.json');
  let symlinkSupported = true;
  try {
    await symlink(configPath, link);
    await rm(configPath);
    await symlink(link, configPath);
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    symlinkSupported = false;
  }
  if (symlinkSupported) {
    await assert.rejects(loadStage1TrustConfig({ homeDirectory: home }), { reasonCode: 'stage1_trust_configuration_invalid' });
    await rm(configPath);
  }
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  if (process.platform !== 'win32') {
    await chmod(configPath, 0o644);
    await assert.rejects(loadStage1TrustConfig({ homeDirectory: home }), { reasonCode: 'stage1_trust_configuration_invalid' });
  }
});

it('resolves the trust file from the operating system user home, not USERPROFILE', () => {
  const originalUserProfile = process.env.USERPROFILE;
  const osResolvedHome = os.userInfo().homedir;
  try {
    process.env.USERPROFILE = path.join(os.tmpdir(), 'untrusted-home-override');
    assert.equal(stage1TrustConfigPath(), path.resolve(osResolvedHome, STAGE1_TRUST_CONFIG_RELATIVE_PATH));
  } finally {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
  }
});

it('fails closed when the operating system home cannot be resolved', async () => {
  const originalUserInfo = os.userInfo;
  try {
    os.userInfo = () => { throw new Error('home lookup failed'); };
    assert.throws(stage1TrustConfigPath, { reasonCode: 'stage1_trust_configuration_unavailable' });
    await assert.rejects(loadStage1TrustConfig(), { reasonCode: 'stage1_trust_configuration_unavailable' });
    os.userInfo = () => ({ homedir: '' });
    assert.throws(stage1TrustConfigPath, { reasonCode: 'stage1_trust_configuration_unavailable' });
  } finally {
    os.userInfo = originalUserInfo;
  }
});
