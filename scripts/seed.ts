import { ensureCanonicalJourney, ensurePracticeParticipant } from '../src/lib/beta-service';
import { prisma } from '../src/lib/db';

await ensureCanonicalJourney('seed');
const result = await ensurePracticeParticipant('seed');
console.log(`Canonical beta journey ready. Practice participant: ${result.participant.name}. Invite preview: ${result.invite.codePreview}`);
await prisma.$disconnect();
