// Server modules use CommonJS `require("./sibling")` to load sibling .ts files
// (resolved by tsx at runtime). Register tsx's CJS hook so those in-module
// requires resolve .ts the same way during tests, instead of Node's bare
// require failing to find the extensionless module.
import "tsx/cjs";
