// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import "@testing-library/jest-dom/extend-expect";
import { TextDecoder, TextEncoder } from "util";
import "text-encoding";
Object.assign(global, { TextDecoder, TextEncoder });

// useNavigate mocking
jest.mock("react-router-dom", () => ({
    ...jest.requireActual("react-router-dom"),
    useNavigate: () => jest.fn(),
}));
class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
global.clearImmediate = jest.fn();
global.ResizeObserver = ResizeObserver;
