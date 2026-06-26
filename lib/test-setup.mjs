// Node loader hook that stubs out "server-only" so pure helper tests
// can import server modules without triggering the Next.js guard.
import { createRequire } from "node:module";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { shortCircuit: true, url: "data:text/javascript," };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "data:text/javascript,") {
    return { shortCircuit: true, format: "module", source: "" };
  }
  return nextLoad(url, context);
}
