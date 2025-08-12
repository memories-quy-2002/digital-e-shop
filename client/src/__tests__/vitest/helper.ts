import { expect } from "vitest";
import pretty from "pretty";
export function expectPrettyHTML(container: HTMLElement) {
    expect(pretty(container.innerHTML)).toMatchSnapshot();
}
