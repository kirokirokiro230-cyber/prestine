/**
 * Admin account recovery.
 *
 * Usage:
 *   npm run admin -- list
 *   npm run admin -- reset <email> <new-password>
 *   npm run admin -- create <email> "<Full Name>" <password> [role]
 *
 * ## Why a script rather than editing the table
 *
 * `admins.password_hash` is a scrypt-derived key and `admins.password_salt` is
 * the salt it was derived with (see `hashPassword` in `src/server/auth.ts`).
 * Sign-in recomputes the derivation and compares, so there is no plaintext to
 * paste into Supabase — a password typed straight into the column simply never
 * verifies.
 *
 * This calls the application's own `createAdmin` / `updateAdmin`, which means
 * the hash, the salt, the password policy and the last-owner guard are all
 * exactly what the login path expects. Nothing here reimplements crypto.
 *
 * Run it locally against the same SUPABASE_URL the site uses.
 */

import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.');
  process.exit(1);
}

/*
 * `createSessionToken` requires a session secret at import time outside
 * development, and this runs as a plain script with NODE_ENV unset. Supplying a
 * throwaway keeps the import working; no session is ever minted here.
 */
process.env.ADMIN_SESSION_SECRET ||= 'script-only-secret-not-used-for-any-session-aaaaaaaa';

const {
  createAdmin,
  findAdminByEmail,
  listAdmins,
  needsFirstAdmin,
  updateAdmin,
  validatePasswordStrength,
} = await import('../src/server/auth');

const [command, ...args] = process.argv.slice(2);

function usage(): never {
  console.log(`
Admin account recovery

  npm run admin -- list
      Show every staff account, with role and status.

  npm run admin -- reset <email> <new-password>
      Set a new password on an existing account.

  npm run admin -- create <email> "<Full Name>" <password> [owner|manager|staff]
      Add an account. Defaults to owner.

Password policy: at least 12 characters, with an uppercase letter, a
lowercase letter and a number.
`);
  process.exit(1);
}

switch (command) {
  case 'list': {
    const admins = await listAdmins();

    if (admins.length === 0) {
      console.log(
        '\nNo staff accounts exist.\n\n' +
          'That means /admin/setup is unlocked — open it in the browser and create\n' +
          'the first owner there, no script needed.\n',
      );
      break;
    }

    console.log(`\n${admins.length} staff account(s):\n`);
    for (const admin of admins) {
      console.log(
        `  ${admin.email.padEnd(34)} ${admin.role.padEnd(8)}` +
          `${admin.disabled ? ' DISABLED' : ''}` +
          `${admin.lastLoginAt ? `  last login ${admin.lastLoginAt.slice(0, 10)}` : '  never signed in'}`,
      );
    }
    console.log('\nReset one with:  npm run admin -- reset <email> <new-password>\n');
    break;
  }

  case 'reset': {
    const [email, password] = args;
    if (!email || !password) usage();

    const problem = validatePasswordStrength(password);
    if (problem) {
      console.error(`\nThat password will be rejected: ${problem}\n`);
      process.exit(1);
    }

    const admin = await findAdminByEmail(email);
    if (!admin) {
      console.error(
        `\nNo account for ${email}.\n` +
          'Run `npm run admin -- list` to see the addresses that do exist.\n',
      );
      process.exit(1);
    }

    await updateAdmin(admin.id, { password });

    // Deliberately not echoing the password back — it would land in shell history
    // and scrollback.
    console.log(
      `\nPassword updated for ${admin.email} (${admin.role}).\n` +
        'Sign in at /admin/login.\n' +
        '\nIf sign-in says "Too many failed attempts", that is the brute-force\n' +
        'limiter holding a 15-minute window. Wait it out, or clear it with:\n' +
        `  npm run admin -- unlock ${admin.email}\n`,
    );
    break;
  }

  case 'unlock': {
    const [email] = args;
    if (!email) usage();

    const { clearFailedLogins } = await import('../src/server/login-attempts');
    await clearFailedLogins(`email:${email.trim().toLowerCase()}`);

    console.log(
      `\nCleared the failed-attempt history for ${email}.\n` +
        'Note the limiter also counts per IP address, so if you locked yourself\n' +
        'out from one network that key may still be holding. It expires after 15\n' +
        'minutes either way.\n',
    );
    break;
  }

  case 'create': {
    const [email, name, password, role = 'owner'] = args;
    if (!email || !name || !password) usage();

    if (role !== 'owner' && role !== 'manager' && role !== 'staff') {
      console.error(`\nUnknown role "${role}". Use owner, manager or staff.\n`);
      process.exit(1);
    }

    const problem = validatePasswordStrength(password);
    if (problem) {
      console.error(`\nThat password will be rejected: ${problem}\n`);
      process.exit(1);
    }

    if (await findAdminByEmail(email)) {
      console.error(
        `\n${email} already exists. Reset it instead:\n` +
          `  npm run admin -- reset ${email} <new-password>\n`,
      );
      process.exit(1);
    }

    const first = await needsFirstAdmin();
    const admin = await createAdmin({ email, name, password, role });

    console.log(
      `\nCreated ${admin.email} as ${admin.role}.\n` +
        (first ? 'This is the first account, so /admin/setup is now closed.\n' : '') +
        'Sign in at /admin/login.\n',
    );
    break;
  }

  default:
    usage();
}
