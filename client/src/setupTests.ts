import "@testing-library/jest-dom/vitest"; // Already good

// Mock ResizeObserver
class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

// @ts-ignore
global.ResizeObserver = ResizeObserver;
