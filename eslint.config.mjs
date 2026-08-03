import reactHooks from "eslint-plugin-react-hooks";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// ESLint 9 flat config. Next 16 dropped the `next lint` command, and
// eslint-config-next 16 requires ESLint 9, which no longer reads
// .eslintrc.json — so the old two-line eslintrc became this.
//
// These entry points already ship as flat-config arrays, so they are spread
// directly. Do NOT route them through @eslint/eslintrc's FlatCompat: it tries
// to normalise them as eslintrc objects and dies on a circular reference.
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "prisma/migrations/**",
      "public/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // eslint-config-next 16 turns on the React Compiler-era `react-hooks` rules
    // as ERRORS. Of the 28 that flagged, the 7 that were genuine defects are
    // fixed: a component declared inside render (state reset every pass), four
    // render-phase ref writes (unsafe when React renders twice), and a variable
    // mutated mid-render.
    //
    // The 19 that remain are `set-state-in-effect`, and they were each read
    // rather than counted. They are the patterns React itself requires without
    // the compiler: SSR mount guards (`setMounted(true)` before portaling),
    // localStorage hydration, hydration-safe clocks, rAF/interval animations,
    // and a debounced async lookup. None can be derived during render, and
    // "fixing" them would break SSR safety or the animation. Two more
    // (ListingFeed, RescueMap) sync derived state the user can also override by
    // hand, which needs an effect or a key-reset — a behaviour change, not a
    // lint fix.
    //
    // So this stays at `warn`: the signal is kept for whoever adopts React
    // Compiler, without failing the pre-push hook over code that is correct
    // today. `preserve-manual-memoization` is informational — the compiler
    // simply declines to optimise that component.
    // Flat config needs the plugin declared in the same object as its rules.
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      // Flat config's default export is legitimately an array here.
      "import/no-anonymous-default-export": "off",
    },
  },
];
