import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@next/next/no-img-element": "off",
      "react/no-unescaped-entities": "warn",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
