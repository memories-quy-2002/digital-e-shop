const { DEMO_SEED_PLAN } = require("./demo-seed-data");
const { resolveDemoSeedPlan } = require("./demo-firebase-identities");

const verifyDemoFirebaseIdentities = async () => {
    if (process.env.NODE_ENV !== "production") {
        throw new Error("Firebase demo identity preflight is intended for the production reset workflow");
    }

    const plan = await resolveDemoSeedPlan(DEMO_SEED_PLAN);
    process.stdout.write(
        `Validated ${plan.users.length} existing Firebase email/password demo identities in project ${process.env.FIREBASE_PROJECT_ID}\n`,
    );
};

if (require.main === module) {
    verifyDemoFirebaseIdentities().catch((error) => {
        process.stderr.write(`Firebase demo identity preflight failed: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { verifyDemoFirebaseIdentities };
