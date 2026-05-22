// Bypasses drizzle-kit and uses drizzle-orm migrator directly
// so we can see the actual SQL error from Neon.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connStr = process.env.INKEEP_AGENTS_RUN_DATABASE_URL;
if (!connStr) {
  console.error('ERROR: INKEEP_AGENTS_RUN_DATABASE_URL is not set');
  process.exit(1);
}

console.log('=== Connecting to run DB ===');
const pool = new pg.Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool);

const migrationsFolder = path.join(
  __dirname,
  '../node_modules/@inkeep/agents-core/drizzle/runtime'
);

console.log('=== Migrations folder:', migrationsFolder, '===');

try {
  await migrate(db, { migrationsFolder });
  console.log('=== Run DB migrations applied successfully ===');
} catch (err) {
  console.error('=== Run DB migration FAILED ===');
  console.error('Message:', err.message);
  console.error('Code:', err.code);
  console.error('Detail:', err.detail);
  console.error('Hint:', err.hint);
  console.error('Full error:', err);
  process.exit(1);
} finally {
  await pool.end();
}
