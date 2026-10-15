import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/src/app.module.js";
import { TaskRunnerService } from "../dist/src/operations/task-runner.service.js";
import { closeDatabasePool } from "../dist/src/config/database.config.js";

function readOptions(args) {
    const options = { limit: 20, budgetMs: 20000 };
    for (let index = 0; index < args.length; index += 1) {
        const name = args[index];
        const value = Number(args[index + 1]);
        if (!Number.isSafeInteger(value)) throw new Error(`Invalid value for ${name}`);
        if (name === "--limit") options.limit = value;
        else if (name === "--budget-ms") options.budgetMs = value;
        else throw new Error(`Unknown option ${name}`);
        index += 1;
    }
    if (options.limit < 1 || options.limit > 100 || options.budgetMs < 1 || options.budgetMs > 20000) {
        throw new Error("Expected --limit 1..100 and --budget-ms 1..20000");
    }
    return options;
}

let context;
try {
    const options = readOptions(process.argv.slice(2));
    context = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const summary = await context.get(TaskRunnerService).run(options);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Operations runner failed"}\n`);
    process.exitCode = 1;
} finally {
    try {
        await context?.close();
    } finally {
        await closeDatabasePool();
    }
}
