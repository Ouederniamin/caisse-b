import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create test users for mobile app
  const users = [
    {
      email: 'controle@test.com',
      password: 'controle123',
      role: 'AGENT_CONTROLE',
    },
    {
      email: 'hygiene@test.com',
      password: 'hygiene123',
      role: 'AGENT_HYGIENE',
    },
    {
      email: 'securite@test.com',
      password: 'securite123',
      role: 'SECURITE',
    },
    {
      email: 'admin@test.com',
      password: 'admin123',
      role: 'ADMIN',
    },
  ];

  for (const userData of users) {
    // Create user with password (plain text for development)
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: { password_hash: userData.password },
      create: {
        email: userData.email,
        password_hash: userData.password, // In dev: plain password for easy testing
        role: userData.role as any,
      },
    });
    console.log(`✓ Created/Updated user: ${user.email} (${user.role}) - Password: ${userData.password}`);
  }

  console.log('\n✅ Test users created successfully!');
  console.log('\nYou can now login with:');
  console.log('  - controle@test.com / controle123');
  console.log('  - hygiene@test.com / hygiene123');
  console.log('  - securite@test.com / securite123');
  console.log('  - admin@test.com / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
