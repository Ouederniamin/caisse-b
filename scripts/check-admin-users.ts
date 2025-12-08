import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAdminUser() {
  try {
    console.log('🔍 Checking admin users...\n');

    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { role: 'DIRECTION' },
          { email: { contains: 'admin' } }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      }
    });

    if (admins.length === 0) {
      console.log('❌ No admin users found!');
      console.log('\nLet me check all users:');
      
      const allUsers = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        }
      });
      
      console.log('\n📋 All users:');
      allUsers.forEach(user => {
        console.log(`  - ${user.email} | ${user.name} | Role: ${user.role}`);
      });
    } else {
      console.log('✅ Admin users found:');
      admins.forEach(admin => {
        console.log(`  - ${admin.email} | ${admin.name} | Role: ${admin.role}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminUser()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
