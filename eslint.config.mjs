import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // D3: Routers must stay thin — no direct Drizzle access.
  // DB logic belongs in src/infrastructure/db/repositories/.
  // If a query is too complex for the current repositories, add a method there.
  {
    files: ["server/routers/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/db", "@/db/*"],
            message:
              "Routers must not import from @/db directly. " +
              "Use a repository from @/src/infrastructure/db/repositories/ or a handler from @/src/application/.",
          },
          {
            group: ["drizzle-orm", "drizzle-orm/*"],
            message:
              "Routers must not use drizzle-orm directly. " +
              "Move the query to a repository method in @/src/infrastructure/db/repositories/.",
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
