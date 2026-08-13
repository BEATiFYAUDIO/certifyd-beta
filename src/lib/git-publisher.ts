import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { publishPublicSite } from './static-publisher';

const execFileAsync = promisify(execFile);

type GitRunner = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

type DeployResult = {
  changed: boolean;
  message: string;
};

async function runGit(args: string[]) {
  return execFileAsync('git', args, { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
}

export async function commitAndPushPublicOutput(message: string, runner: GitRunner = runGit): Promise<DeployResult> {
  const status = await runner(['status', '--short', '--', 'generated-public']);
  if (!status.stdout.trim()) return { changed: false, message: 'No generated public changes to deploy.' };

  await runner(['add', '--', 'generated-public']);
  const staged = await runner(['diff', '--cached', '--name-only', '--', 'generated-public']);
  if (!staged.stdout.trim()) return { changed: false, message: 'No generated public changes to deploy.' };

  await runner(['commit', '-m', message, '--', 'generated-public']);
  await runner(['push']);
  return { changed: true, message: 'Committed and pushed generated public output.' };
}

export async function publishAndDeployPublicSite(message: string) {
  const publish = await publishPublicSite();
  const deploy = publish.changed ? await commitAndPushPublicOutput(message) : { changed: false, message: publish.message };
  return { publish, deploy };
}
