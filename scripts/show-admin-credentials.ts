import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showAdminCredentials() {
  try {
    console.log('🔐 Admin Credentials\n');
    console.log('═'.repeat(50));

    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { role: 'DIRECTION' }
        ]
      },
      include: {
        accounts: {
          select: {
            password: true
          }
        }
      },
      orderBy: {
        role: 'asc'
      }
    });

    admins.forEach((admin, index) => {
      console.log(`\n${index + 1}. ${admin.name || admin.email}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Role: ${admin.role}`);
      
      if (admin.accounts.length > 0 && admin.accounts[0].password) {
        console.log(`   Password: ${admin.accounts[0].password}`);
      } else if (admin.password_hash) {
        console.log(`   Password Hash: ${admin.password_hash.substring(0, 20)}...`);
      } else {
        console.log(`   ⚠️  No password found - needs to be set`);
      }
    });

    console.log('\n' + '═'.repeat(50));
    console.log('\n📝 To login on Vercel:');
    console.log('   1. Go to https://caisse-w.vercel.app/login');
    console.log('   2. Use one of the emails and passwords above');
    console.log('   3. You will have access to the dashboard\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

showAdminCredentials()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
