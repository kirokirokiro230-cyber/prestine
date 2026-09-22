import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Flat config. eslint-config-next 16 ships native flat configs, so it is spread
 * directly rather than going through the eslintrc compat layer.
 */
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "out/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default eslintConfig;
