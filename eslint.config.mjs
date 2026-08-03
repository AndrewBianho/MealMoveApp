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
    // as ERRORS. They flag 28 long-standing patterns here — 19 of them
    // `set-state-in-effect` alone, across the map, listing detail, and the
    // claim-hold clock. Fixing those is a real refactor of effect and ref
    // handling, not part of a version upgrade, and the pre-push hook gates on
    // lint errors, so leaving them fatal would block every push.
    //
    // Held at `warn`: the debt stays visible and the gate stays where it was
    // (zero errors) instead of the upgrade quietly raising the bar. Worth
    // working down before any React Compiler adoption, which is what these
    // rules exist to prepare for.
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
