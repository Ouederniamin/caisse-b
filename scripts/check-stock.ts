import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('1. Checking stock...');
  const stocks = await prisma.stockCaisse.findMany();
  console.log('Stock records:', stocks);
  
  console.log('\n2. Mouvement summary by type...');
  const mouvementsByType = await prisma.mouvementCaisse.groupBy({
    by: ['type'],
    _sum: { quantite: true }
  });
  console.log('Mouvements by type:', mouvementsByType);
  
  console.log('\n3. All mouvements...');
  const allMouvements = await prisma.mouvementCaisse.findMany({
    orderBy: { createdAt: 'desc' },
    include: { tour: { select: { matricule_vehicule: true } } }
  });
  console.log('All mouvements count:', allMouvements.length);
  allMouvements.forEach(m => {
    console.log(`  ${m.type}: ${m.quantite} -> ${m.solde_apres} (${m.tour?.matricule_vehicule || 'N/A'})`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
