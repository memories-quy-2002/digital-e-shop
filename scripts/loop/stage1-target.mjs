export function selectUniqueRerunTarget({ decision, candidates } = {}) {
  if (decision?.action !== 'retry-check') {
    throw Object.assign(new Error('retry_decision_required'), { code: 'retry_decision_required' });
  }
  if (!Array.isArray(candidates) || candidates.length !== 1) {
    throw Object.assign(new Error('rerun_target_ambiguous'), { code: 'rerun_target_ambiguous' });
  }
  return candidates[0];
}
