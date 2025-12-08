const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const prisma = new PrismaClient();
  
  const account = await prisma.account.findFirst({
    where: { providerId: 'credential' }
  });
  
  console.log('Password hash:', account?.password);
  console.log('Hash length:', account?.password?.length);
  console.log('Starts with $2:', account?.password?.startsWith('$2'));
  
  // Test bcrypt
  const testPassword = 'password123';
  const result = await bcrypt.compare(testPassword, account?.password || '');
  console.log('Bcrypt compare with password123:', result);
  
  // Try direct hash comparison
  const newHash = await bcrypt.hash(testPassword, 10);
  console.log('New bcrypt hash:', newHash);
  
  await prisma.$disconnect();
}

main();
