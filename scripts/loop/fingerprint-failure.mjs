import { createHash } from 'node:crypto';

const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const WINDOWS_ABSOLUTE_PATH = /[a-z]:[\\/](?:[^\\/\s:()[\]]+[\\/])*[^\\/\s:()[\]]+/gi;
const POSIX_ABSOLUTE_PATH = /(?<![\w.])\/(?:[^/\s:()[\]]+\/)*[^/\s:()[\]]+/g;
const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g;
const DURATION = /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|secs?|seconds?|s)\b/gi;
const WORKSPACE_ANCHORS = new Set(['.agent', '.github', 'client', 'docs', 'scripts', 'server', 'tests', 'test', 'wiki', 'src']);

function normalizeAbsolutePath(absolutePath) {
  const segments = absolutePath.replaceAll('\\', '/').split('/').filter(Boolean);
  const anchorIndex = segments.findIndex((segment) => WORKSPACE_ANCHORS.has(segment.toLowerCase()));

  if (anchorIndex >= 0) {
    return `<workspace>/${segments.slice(anchorIndex).join('/')}`;
  }

  return `<absolute>/${segments.slice(-3).join('/')}`;
}

function normalizeStream(stream) {
  return stream
    .replace(ANSI_ESCAPE, '')
    .replace(WINDOWS_ABSOLUTE_PATH, normalizeAbsolutePath)
    .replace(POSIX_ABSOLUTE_PATH, normalizeAbsolutePath)
    .replace(ISO_TIMESTAMP, '<timestamp>')
    .replace(DURATION, '<duration>')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function fingerprintFailure(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('failure input must be an object');
  }
  if (typeof input.commandId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(input.commandId)) {
    throw new TypeError('commandId must be a stable command identifier');
  }
  if (!Number.isSafeInteger(input.exitCode)) {
    throw new TypeError('exitCode must be a safe integer');
  }
  for (const key of ['stdout', 'stderr']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') {
      throw new TypeError(`${key} must be a string when provided`);
    }
  }

  const normalized = JSON.stringify({
    commandId: input.commandId,
    exitCode: input.exitCode,
    stdout: normalizeStream(input.stdout ?? ''),
    stderr: normalizeStream(input.stderr ?? ''),
  });

  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
