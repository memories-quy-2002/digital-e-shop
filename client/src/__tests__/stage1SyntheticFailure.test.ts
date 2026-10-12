import { expect, it } from "vitest";

it("passes except for the explicitly scoped synthetic Stage 1 retry drill", () => {
    const isSyntheticRetryAttempt =
        process.env.GITHUB_ACTIONS === "true" &&
        process.env.GITHUB_WORKFLOW === "CI" &&
        process.env.GITHUB_RUN_ATTEMPT === "2";

    if (isSyntheticRetryAttempt) {
        throw new Error(
            "SYNTHETIC_STAGE1_DRILL: deliberate client failure on CI attempt 2",
        );
    }

    expect(true).toBe(true);
});
