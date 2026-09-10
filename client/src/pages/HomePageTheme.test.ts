import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(path.resolve(process.cwd(), "src/styles/pages/_home.scss"), "utf8")
    .replace(/\r\n/g, "\n");

  describe("HomePage proof theme", () => {
      it("keeps the proof section on a dark surface in both themes", () => {
          expect(stylesheet).toContain(
              "    &__proof {\n        padding: clamp(4rem, 8vw, 7rem) 0;\n        background: var(--home-hero);\n        color: var(--home-hero-ink);",
          );
      });
  });
