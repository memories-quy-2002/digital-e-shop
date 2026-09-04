import util from "node:util";
import pino, { type Logger as PinoLogger } from "pino";
import { isProduction } from "#src/config/env.config";

type LogLevel = "info" | "warn" | "error" | "debug";

const transport = !isProduction
    ? pino.transport({
          target: "pino-pretty",
          options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
              singleLine: true,
          },
      })
    : undefined;

const rootLogger = pino(
    {
        level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
        base: undefined,
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport,
);

const formatValue = (value: unknown) => {
    if (value instanceof Error) {
        return {
            err: {
                name: value.name,
                message: value.message,
                stack: value.stack,
            },
        };
    }

    return value;
};

const write = (target: PinoLogger, level: LogLevel, ...values: unknown[]) => {
    if (values.length === 0) {
        target[level]("");
        return;
    }

    if (values.length === 1) {
        const [value] = values;
        if (typeof value === "object" && value !== null && !(value instanceof Error)) {
            target[level](value);
            return;
        }

        if (value instanceof Error) {
            target[level](formatValue(value), value.message);
            return;
        }

        target[level](String(value));
        return;
    }

    const [first, ...rest] = values;
    if (typeof first === "string") {
        if (rest.length === 1 && typeof rest[0] === "object" && rest[0] !== null) {
            target[level](formatValue(rest[0]), first);
            return;
        }

        const suffix = rest
            .map((value) =>
                typeof value === "string"
                    ? value
                    : util.inspect(value, { depth: 6, breakLength: 120, compact: true }),
            )
            .join(" ");
        target[level](suffix ? `${first} ${suffix}` : first);
        return;
    }

    target[level](
        values
            .map((value) =>
                typeof value === "string"
                    ? value
                    : util.inspect(value, { depth: 6, breakLength: 120, compact: true }),
            )
            .join(" "),
    );
};

const createLogger = (target: PinoLogger) => ({
    info: (...values: unknown[]) => write(target, "info", ...values),
    warn: (...values: unknown[]) => write(target, "warn", ...values),
    error: (...values: unknown[]) => write(target, "error", ...values),
    debug: (...values: unknown[]) => write(target, "debug", ...values),
    child: (bindings: Record<string, unknown>) => createLogger(target.child(bindings)),
    raw: target,
});

export const logger = createLogger(rootLogger);
