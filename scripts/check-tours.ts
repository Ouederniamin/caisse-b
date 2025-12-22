import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all tours with PRET_A_PARTIR status
  const tours = await prisma.tour.findMany({
    where: { statut: 'PRET_A_PARTIR' },
    select: {
      id: true,
      matricule_vehicule: true,
      statut: true,
      poids_brut_securite_sortie: true,
      createdAt: true,
    },
  });
  
  console.log('Tours with PRET_A_PARTIR status:');
  console.log(JSON.stringify(tours, null, 2));
  
  // Check today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  console.log('\nToday (client time):', today.toISOString());
  
  // Filter for today
  const todaysTours = tours.filter(tour => {
    const tourDate = new Date(tour.createdAt);
    tourDate.setHours(0, 0, 0, 0);
    return tourDate.getTime() === today.getTime();
  });
  
  console.log('\nTours for today:', todaysTours.length);
  console.log(JSON.stringify(todaysTours, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
