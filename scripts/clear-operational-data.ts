import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearOperationalData() {
  try {
    console.log('🗑️  Starting database cleanup...\n');

    // Delete all conflicts first (has foreign keys to tours)
    const deletedConflicts = await prisma.conflict.deleteMany({});
    console.log(`✅ Deleted ${deletedConflicts.count} conflicts`);

    // Delete all notifications
    const deletedNotifications = await prisma.notification.deleteMany({});
    console.log(`✅ Deleted ${deletedNotifications.count} notifications`);

    // Delete all tours (tournées)
    const deletedTours = await prisma.tour.deleteMany({});
    console.log(`✅ Deleted ${deletedTours.count} tours`);

    // Delete all drivers (chauffeurs)
    const deletedDrivers = await prisma.driver.deleteMany({});
    console.log(`✅ Deleted ${deletedDrivers.count} drivers`);

    // Keep users (agents) but you can optionally delete specific roles
    // Uncomment below if you want to delete agent records too:
    // const deletedAgents = await prisma.user.deleteMany({
    //   where: {
    //     role: {
    //       in: ['AGENT_CONTROLE', 'AGENT_HYGIENE', 'SECURITE']
    //     }
    //   }
    // });
    // console.log(`✅ Deleted ${deletedAgents.count} agents`);

    console.log('\n✨ Database cleanup completed successfully!');
    console.log('\nRemaining data:');
    console.log(`- Users (agents): ${await prisma.user.count()}`);
    console.log(`- Secteurs: ${await prisma.secteur.count()}`);
    console.log(`- Sessions: ${await prisma.session.count()}`);
    console.log(`- Accounts: ${await prisma.account.count()}`);

  } catch (error) {
    console.error('❌ Error clearing operational data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearOperationalData()
  .then(() => {
    console.log('\n✅ Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
