import { PrismaClient, ParticipantStatus } from '@prisma/client';
import { createParticipant, generateInvite } from '../src/lib/beta-service';

const prisma = new PrismaClient();

async function main() {
  const mission = await prisma.mission.upsert({
    where: { slug: 'run-your-own-creator-network' },
    update: {},
    create: {
      name: 'Run your own creator network',
      slug: 'run-your-own-creator-network',
      shortDescription: 'Run Certifyd Core in a real creator workflow and invite the next collaborator.',
      inviteCopy: "We're opening Certifyd Core to a small number of people during our technical beta. You'll run Certifyd Core in a real creator workflow, use your preferred AI coding agent with the repository and documentation, and work directly with the Certifyd team throughout the beta.",
      milestones: {
        create: [
          'Core repo cloned',
          'Core running',
          'Creator identity/profile established',
          'First work published',
          'Commerce tested',
          'Second participant invited',
          'Real transaction completed',
          'Feedback session completed',
        ].map((title, sortOrder) => ({ title, sortOrder })),
      },
    },
  });

  if (!(await prisma.participant.findFirst({ where: { email: 'teddy.demo@example.test' } }))) {
    const teddy = await createParticipant({ name: 'Teddy Demo', email: 'teddy.demo@example.test', organizationOrProject: 'Development seed network', roleDescription: 'Root beta participant', aiAgent: 'Codex', operatingSystem: 'Windows', missionId: mission.id }, 'seed');
    await generateInvite(teddy.id, 'seed');
    await prisma.participant.update({ where: { id: teddy.id }, data: { status: ParticipantStatus.INVITED } });

    const producer = await createParticipant({ name: 'Producer Demo', email: 'producer.demo@example.test', organizationOrProject: 'Development seed network', roleDescription: 'First downstream participant', aiAgent: 'Codex', operatingSystem: 'macOS', missionId: mission.id, parentParticipantId: teddy.id }, 'seed');
    await prisma.participant.update({ where: { id: producer.id }, data: { status: ParticipantStatus.INSTALLING } });

    await createParticipant({ name: 'Artist Demo', email: 'artist.demo@example.test', organizationOrProject: 'Development seed network', roleDescription: 'Second-level downstream participant', aiAgent: 'Cursor', operatingSystem: 'Windows', missionId: mission.id, parentParticipantId: producer.id }, 'seed');
  }

  const artist = await prisma.participant.findFirst({ where: { email: 'artist.demo@example.test' }, include: { parentParticipant: true, networkOriginParticipant: true } });
  console.log(`Development seed complete. Artist parent=${artist?.parentParticipant?.name || 'missing'} origin=${artist?.networkOriginParticipant?.name || 'missing'}`);
}

main().finally(() => prisma.$disconnect());
