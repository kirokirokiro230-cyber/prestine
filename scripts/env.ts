import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Load environment files for the command-line tools.
 *
 * `next dev` and `next build` read `.env.local` and `.env` themselves. Nothing else does:
 * `drizzle-kit` looks only at `.env`, and a plain `tsx` script looks at neither. So the
 * migration and seed commands would read an empty `DIRECT_URL` while the app in the next
 * terminal window worked perfectly — which is a genuinely confusing half hour.
 *
 * Precedence matches Next's, and is a consequence of the order rather than of any special
 * handling: `process.loadEnvFile` does not overwrite a variable that is already set, so the
 * first file to define one wins, and a real environment variable beats both files. That
 * last part matters in CI, where the values arrive from the platform and no file exists.
 *
 * Imported for its side effect. There is nothing to configure and no reason for a caller to
 * decide when this happens.
 */
const FILES = [".env.local", ".env"];

for (const file of FILES) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) continue;

  try {
    process.loadEnvFile(path);
  } catch (error) {
    // A malformed file is worth naming. Carrying on lets the caller's own "this variable
    // is missing" message appear too, which together point straight at the cause.
    console.warn(`[env] could not read ${file}:`, (error as Error).message);
  }
}
