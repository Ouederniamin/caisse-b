import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tours = await prisma.tour.findMany({
    take: 3,
    include: { chauffeur: true }
  });
  
  console.log('Tours with chauffeurs:');
  tours.forEach(t => {
    console.log(`  - ${t.matricule_vehicule}: ${t.chauffeur?.name || 'NO CHAUFFEUR'}`);
  });
  
  const mouvements = await prisma.mouvementCaisse.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { tour: { include: { chauffeur: true } } }
  });
  
  console.log('\nMouvements with chauffeurs:');
  mouvements.forEach(m => {
    console.log(`  - ${m.type}: ${m.tour?.matricule_vehicule || 'NO TOUR'} - ${m.tour?.chauffeur?.name || 'NO CHAUFFEUR'}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
