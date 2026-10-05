export function createWorkflowSourceVerifier({ verifyTrustedRecord } = {}) {
  return async function verifyWorkflowSourceAttestation({ identity, run, snapshot } = {}) {
    if (typeof verifyTrustedRecord !== 'function' || !identity || !run || !snapshot) return false;
    if (identity.type !== 'workflow' || run.sourceShaAttested !== true) return false;
    if (identity.repositoryId !== snapshot.repositoryId || run.repositoryId !== snapshot.repositoryId) return false;
    if (identity.path !== run.path || identity.ref !== run.ref || identity.sha !== run.sourceSha) return false;
    if (!Number.isSafeInteger(run.id) || run.id < 1
        || !Number.isSafeInteger(run.runAttempt) || run.runAttempt < 1) return false;
    if (run.testedSha !== snapshot.headSha && run.testedSha !== snapshot.mergeSha) return false;

    try {
      return await verifyTrustedRecord({ identity, run, snapshot }) === true;
    } catch {
      return false;
    }
  };
}
