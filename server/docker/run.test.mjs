import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { buildDockerPlan, readDockerEnvironment } from "./run.mjs";

const root = path.resolve("checkout with spaces", "server");
const env = { DB_HOST: "127.0.0.1", DB_PORT: "3307", DB_USER: "root", DB_PASSWORD: "local-test", DB_NAME: "digital_e_shop_local" };

test("local commands reject remote targets even with a remote opt-in", () => {
    assert.throws(() => buildDockerPlan("import", { ...env, DB_HOST: "db.example.com", ALLOW_REMOTE_DATABASE: "true" }, root), /non-local/);
    assert.throws(() => buildDockerPlan("migrate", { ...env, DATABASE_URL: "mysql://root:test@db.example.com/test" }, root), /non-local/);
});

test("local configuration overrides inherited production settings", () => {
    const configured = readDockerEnvironment("DB_PASSWORD=local-test\nDB_NAME=digital_e_shop_local", { NODE_ENV: "production", DB_HOST: "db.example.com", DATABASE_URL: "mysql://root:secret@db.example.com/live" });
    assert.equal(configured.DB_HOST, "127.0.0.1");
    assert.equal(configured.NODE_ENV, "development");
    assert.equal(new URL(configured.DATABASE_URL).hostname, "127.0.0.1");
});

test("local import and Prisma targets cannot disagree", () => {
    for (const url of [
        "mysql://root:local-test@127.0.0.1:3308/digital_e_shop_local",
        "mysql://root:local-test@127.0.0.1:3307/another_database",
        "mysql://another_user:local-test@127.0.0.1:3307/digital_e_shop_local",
    ]) assert.throws(() => buildDockerPlan("migrate", { ...env, DATABASE_URL: url }, root), /DATABASE_URL must match/);
});

test("Compose uses the checkout path and waits for database health", () => {
    const [step] = buildDockerPlan("up", env, root);
    assert.equal(step.command, "docker");
    assert.deepEqual(step.args, ["compose", "--env-file", path.join(root, ".env.docker"), "up", "-d", "--wait"]);
});

test("baseline import preserves historical SQL order without exposing passwords in arguments", () => {
    const steps = buildDockerPlan("import", env, root);
    assert.equal(steps.length, 2);
    assert.match(steps[0].inputFile, /defaultdb_2026-06-01_142319.sql$/);
    assert.match(steps[1].inputFile, /2026-07-07-add-stripe-payment-support.sql$/);
    assert.equal(steps[0].stripGtid, true);
    assert.ok(steps[0].args.includes("MYSQL_PWD"));
    assert.ok(!steps[0].args.join(" ").includes(env.DB_PASSWORD));
});

test("migration records the baseline before deploying forward migrations", () => {
    const steps = buildDockerPlan("migrate", env, root);
    assert.deepEqual(steps.map((step) => step.args.slice(1)), [["migrate", "resolve", "--applied", "0_init", "--config", "prisma.config.ts"], ["migrate", "deploy", "--config", "prisma.config.ts"]]);
});

test("mock seed keeps bounded counts and unknown operations fail before execution", () => {
    const [step] = buildDockerPlan("seed:mock", env, root);
    assert.equal(step.env.MOCK_ORDER_COUNT, "50");
    assert.equal(step.env.MOCK_REVIEW_COUNT, "50");
    assert.throws(() => buildDockerPlan("reset", env, root), /Unknown Docker operation/);
});
