// Runs each SQL statement individually to find the exact one failing
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, '../node_modules/@inkeep/agents-core/drizzle/runtime');

const connStr = process.env.INKEEP_AGENTS_RUN_DATABASE_URL;
if (!connStr) { console.error('INKEEP_AGENTS_RUN_DATABASE_URL not set'); process.exit(1); }

const pool = new pg.Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

// Read journal to get migration order
const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'));
console.log(`Found ${journal.entries.length} migration(s)`);

// Ensure tracking table exists
await pool.query(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
)`);

// Get already-applied migrations
const { rows: applied } = await pool.query(`SELECT hash FROM "__drizzle_migrations"`);
const appliedHashes = new Set(applied.map(r => r.hash));

for (const entry of journal.entries) {
  const sqlFile = path.join(migrationsFolder, entry.tag + '.sql');
  if (!fs.existsSync(sqlFile)) {
    console.log(`SKIP (file not found): ${entry.tag}`);
    continue;
  }
  if (appliedHashes.has(entry.when.toString())) {
    console.log(`SKIP (already applied): ${entry.tag}`);
    continue;
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  console.log(`\nApplying: ${entry.tag} (${statements.length} statements)`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Print just first 120 chars to avoid rate limit
      console.log(`  [${i+1}/${statements.length}] ${stmt.substring(0, 120).replace(/\n/g, ' ')}...`);
      await client.query(stmt);
    }
    await client.query(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`, [entry.when.toString(), Date.now()]);
    await client.query('COMMIT');
    console.log(`  ✓ Done`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ✗ FAILED on statement ${err.query?.substring(0, 100)}`);
    console.error(`  Error: ${err.message}`);
    client.release();
    await pool.end();
    process.exit(1);
  }
  client.release();
}

console.log('\n=== All run DB migrations applied successfully ===');
await pool.end();
