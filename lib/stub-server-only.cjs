// Stub for "server-only" in the Node test runner environment.
// Intercepts the module before it throws, replacing it with a no-op.
// CommonJS by necessity (it patches Module._load before ESM loads).
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
