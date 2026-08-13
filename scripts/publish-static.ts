import { publishPublicSite } from '../src/lib/static-publisher';
import { prisma } from '../src/lib/db';

try {
  const result = await publishPublicSite();
  console.log(result.message);
  console.log(`Output: ${result.outputDir}`);
  process.exitCode = result.changed ? 0 : 0;
} finally {
  await prisma.$disconnect();
}
