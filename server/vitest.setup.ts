// Nest's DI relies on reflect-metadata being registered globally before any
// decorated class loads — required for @nestjs/testing's Test.createTestingModule.
import "reflect-metadata";
// Server modules use CommonJS `require("./sibling")` to load sibling .ts files
// (resolved by tsx at runtime). Register tsx's CJS hook so those in-module
// requires resolve .ts the same way during tests, instead of Node's bare
// require failing to find the extensionless module.
import "tsx/cjs";

// Firebase is the only auth provider, so env.config validates Firebase settings
// as soon as server modules are imported. Unit tests should use the isolated Auth
// Emulator profile rather than requiring production service-account credentials.
process.env.FIREBASE_PROJECT_ID ??= "demo-digital-e-local";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
