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
    assert.match(loopContract, /merge and production operations remain human-controlled/i);
  });

  it('defines all required sections in the feature loop operating guide', async () => {
    const featureGuide = await read('.agent/loops/feature.md');
    for (const heading of ['Input', 'Inspect', 'Implement', 'Verify', 'Repair', 'Stop', 'Escalate', 'Never']) {
      assert.match(featureGuide, new RegExp(`^## ${heading}$`, 'm'), `missing ${heading} section`);
    }
    assert.match(featureGuide, /high|critical|protected/i);
    assert.match(featureGuide, /\.loop\/state/);
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

    assert.match(index, /^\*\*Last updated:\*\* 2026-09-27$/m);
    assert.match(index, /\[\[loop-engineering\]\]/);
    assert.match(architecture, /^## Loop Engineering control plane$/m);
    assert.match(architecture, /`scripts\/loop\//);
    assert.match(concept, /no GitHub writes/i);
    assert.match(concept, /production/i);
    assert.match(log, /^- 2026-09-27 - Codex - .*Loop Engineering/m);
  });
});
