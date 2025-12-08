import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/bcrypt';

const prisma = new PrismaClient();

async function setAdminPassword() {
  try {
    console.log('🔐 Setting admin password...\n');

    const email = 'admin@caisse.tn';
    const password = 'Admin@2025';

    // Hash the password with bcrypt
    const hashedPassword = await hash(password, 10);

    // Update the account password
    const account = await prisma.account.findFirst({
      where: {
        user: {
          email: email
        }
      }
    });

    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: hashedPassword }
      });
    }

    console.log('✅ Password updated successfully!\n');
    console.log('═'.repeat(50));
    console.log('\n📝 Login Credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log('\n   Login at: https://caisse-w.vercel.app/login');
    console.log('\n' + '═'.repeat(50));

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

setAdminPassword()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
