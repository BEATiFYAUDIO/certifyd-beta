import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for backup.');
const backupDir = path.join(process.cwd(), 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(backupDir, `certifyd-beta-${stamp}.sql`);
const url = new URL(databaseUrl);
const schema = url.searchParams.get('schema');
url.searchParams.delete('schema');
const args = [url.toString(), '--file', output];
if (schema) args.push('--schema', schema);
execFileSync('pg_dump', args, { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`Backup created: ${output}`);
