import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

function section(markdown, title) {
  const lines = markdown.split(/\r?\n/);
  const collected = [];
  let found = false;
  for (const line of lines) {
    if (!found && line === `## ${title}`) {
      found = true;
      continue;
    }
    if (found && /^##\s+/.test(line)) break;
    if (found) collected.push(line);
  }
  return found ? collected.join('\n') : '';
}

describe('Loop Engineering operating contracts', () => {
  it('documents deterministic verification, bounded retries, state location, and human gates in AGENTS.md', async () => {
    const agents = await read('AGENTS.md');
    const loopContract = section(agents, 'Loop Engineering contract');

    assert.notEqual(loopContract, '');
    assert.match(loopContract, /deterministic verification is authoritative/i);
    assert.match(loopContract, /retries are bounded/i);
    assert.match(loopContract, /`\.loop\//);
    assert.match(loopContract, /high\s*\/\s*critical\s*\/\s*protected[\s\S]*human approval/i);
    assert.match(loopContract, /high\/critical policy globs match case-insensitively/i);
    assert.match(loopContract, /no trusted approval provider[\s\S]*high-risk work fails closed/i);
    assert.match(loopContract, /caller-supplied[\s\S]*not authorization/i);
    assert.match(loopContract, /state-only[\s\S]*not a write capability/i);
    assert.match(loopContract, /verification-result context are caller-supplied[\s\S]*not authenticated attestations/i);
    assert.match(loopContract, /Git revision[\s\S]*index plus changed tracked\/untracked working-tree files/i);
    assert.match(loopContract, /verifiedWorkspaceFingerprint[\s\S]*currentWorkspaceFingerprint/i);
    assert.match(loopContract, /fingerprint excludes ignored files[\s\S]*local green results are therefore provisional/i);
    assert.match(loopContract, /hosted CI from a clean checkout[\s\S]*mandatory before handoff/i);
    assert.match(loopContract, /merge and production operations remain human-controlled/i);
  });

  it('defines all required sections in the feature loop operating guide', async () => {
    const featureGuide = await read('.agent/loops/feature.md');
    for (const heading of ['Input', 'Inspect', 'Implement', 'Verify', 'Repair', 'Stop', 'Escalate', 'Never']) {
      assert.match(featureGuide, new RegExp(`^## ${heading}$`, 'm'), `missing ${heading} section`);
    }
    assert.match(featureGuide, /high|critical|protected/i);
    assert.match(featureGuide, /\.loop\/state/);
    assert.match(featureGuide, /no trusted human-approval provider[\s\S]*high-risk work always escalates/i);
    assert.match(featureGuide, /verifiedRevision[\s\S]*currentRevision[\s\S]*workspaceStable/i);
    assert.match(featureGuide, /start\/end workspace fingerprints[\s\S]*host-observed completion fingerprint/i);
    assert.match(featureGuide, /Ignored dependencies\/caches are not fingerprinted[\s\S]*local green results are provisional/i);
    assert.match(featureGuide, /Hosted CI must run from a clean checkout/i);
  });

  it('keeps PR babysitter failure categories and Phase 2 boundaries explicit', async () => {
    const babysitterGuide = await read('.agent/loops/pr-babysitter.md');
    for (const category of ['branch-caused', 'flaky', 'infrastructure', 'protected', 'ambiguous']) {
      assert.ok(babysitterGuide.includes(category), `missing ${category} classification`);
    }
    assert.match(babysitterGuide, /Phase 2/i);
    assert.match(babysitterGuide, /must not merge/i);
  });

  it('parses the JSON-compatible YAML issue form and validates GitHub issue-form fields', async () => {
    const source = await read('.github/ISSUE_TEMPLATE/agent-task.yml');
    // A JSON document is valid YAML 1.2; using JSON syntax also gives this dependency-free test a real parser.
    const template = JSON.parse(source);
    assert.equal(template.name, 'Agent Task');
    assert.equal(typeof template.description, 'string');
    assert.equal(typeof template.title, 'string');
    assert.ok(Array.isArray(template.body));

    const requiredIds = [
      'goal',
      'context',
      'acceptance_criteria',
      'non_goals',
      'constraints',
      'verification',
      'risk_notes',
    ];
    const fieldsById = new Map();
    for (const field of template.body) {
      assert.equal(typeof field.id, 'string');
      assert.ok(['input', 'textarea', 'dropdown', 'checkboxes', 'markdown'].includes(field.type));
      assert.equal(typeof field.attributes?.label, 'string');
      assert.equal(typeof field.attributes?.description, 'string');
      fieldsById.set(field.id, field);
    }
    for (const id of requiredIds) {
      const field = fieldsById.get(id);
      assert.ok(field, `missing issue field ${id}`);
      assert.equal(field.validations?.required, true, `${id} must be explicitly required`);
    }
    assert.equal(fieldsById.size, template.body.length, 'field IDs must be unique');
    assert.equal(template.labels?.includes('agent-ready') ?? false, false, 'Phase 1 must not auto-label tasks for dispatch');
  });

  it('catalogs the Wiki concept, records control-plane placement, and logs the dated update', async () => {
    const [index, architecture, concept, log] = await Promise.all([
      read('Wiki/index.md'),
      read('Wiki/architecture.md'),
      read('Wiki/concepts/loop-engineering.md'),
      read('Wiki/log.md'),
    ]);

    assert.match(index, /^\*\*Last updated:\*\* 2026-09-30$/m);
    assert.match(index, /\[\[loop-engineering\]\]/);
    assert.match(architecture, /^## Loop Engineering control plane$/m);
    assert.match(architecture, /`scripts\/loop\//);
    assert.match(concept, /no GitHub writes/i);
    assert.match(concept, /production/i);
    assert.match(concept, /no trusted approval provider/i);
    assert.match(concept, /state-only/i);
    assert.match(concept, /index plus changed tracked\/untracked files/i);
    assert.match(concept, /excludes ignored dependencies\/caches[\s\S]*local green results are provisional/i);
    assert.match(log, /^- 2026-09-27 - Codex - .*Loop Engineering/m);
    assert.match(log.trimEnd().split(/\r?\n/).at(-1), /^- 2026-09-30 - Codex - .*fixed-repository read-only Stage 0 trusted host/i);
  });
});
