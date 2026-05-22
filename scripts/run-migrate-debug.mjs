// Runs drizzle-kit migrate for the run DB and captures ALL output (stdout + stderr)
import { execSync } from 'node:child_process';

console.log('=== Starting run DB migration ===');
try {
  execSync('node_modules/.bin/drizzle-kit migrate --config=drizzle.run.config.ts', {
    stdio: 'inherit',  // pipes stdout+stderr directly to process output
    encoding: 'utf8',
  });
  console.log('=== Run DB migration succeeded ===');
} catch (err) {
  console.error('=== Run DB migration FAILED ===');
  console.error('Exit code:', err.status);
  console.error('Signal:', err.signal);
  if (err.stdout) console.error('STDOUT:', err.stdout);
  if (err.stderr) console.error('STDERR:', err.stderr);
  process.exit(1);
}
