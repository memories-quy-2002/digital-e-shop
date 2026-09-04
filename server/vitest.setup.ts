// Nest's DI relies on reflect-metadata being registered globally before any
// decorated class loads — required for @nestjs/testing's Test.createTestingModule.
import "reflect-metadata";
// Server modules use CommonJS `require("./sibling")` to load sibling .ts files
// (resolved by tsx at runtime). Register tsx's CJS hook so those in-module
// requires resolve .ts the same way during tests, instead of Node's bare
// require failing to find the extensionless module.
import "tsx/cjs";
