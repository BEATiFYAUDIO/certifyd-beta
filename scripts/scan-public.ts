import { scanPublicOutput, PUBLIC_OUTPUT_DIR } from '../src/lib/static-publisher';

const result = await scanPublicOutput(PUBLIC_OUTPUT_DIR);
console.log(`Public output scan passed: ${result.files} files checked.`);
