import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing tours with EN_ATTENTE_NETTOYAGE status...\n');

  // Update all tours with EN_ATTENTE_NETTOYAGE to TERMINEE
  const result = await prisma.$executeRaw`
    UPDATE "Tour" 
    SET statut = 'TERMINEE' 
    WHERE statut = 'EN_ATTENTE_NETTOYAGE'
  `;

  console.log(`✅ Updated ${result} tour(s) from EN_ATTENTE_NETTOYAGE to TERMINEE`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
