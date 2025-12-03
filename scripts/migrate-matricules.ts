import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Updating matricules to Tunisian format...\n');

  // Update all existing tours with proper Tunisian format
  const tours = await prisma.tour.findMany();
  
  let updated = 0;
  for (const tour of tours) {
    // Convert old format to new format
    let newMatricule = tour.matricule_vehicule;
    
    // If it doesn't already contain Arabic, convert it
    if (!newMatricule.includes('تونس')) {
      // Extract numbers from old format (e.g., "TU-123-456" -> "123" and "456")
      const match = newMatricule.match(/(\d+)/g);
      if (match && match.length >= 2) {
        const serie = match[0].padStart(3, '0').slice(0, 3);
        const unique = match[1].padStart(4, '0').slice(0, 4);
        newMatricule = `${serie} تونس ${unique}`;
      } else {
        // Default format if can't parse - use 190-240 range
        const randomSerie = (190 + (updated % 51)).toString().padStart(3, '0');
        const randomUnique = Math.floor(1000 + Math.random() * 9000).toString();
        newMatricule = `${randomSerie} تونس ${randomUnique}`;
      }
      
      await prisma.tour.update({
        where: { id: tour.id },
        data: { matricule_vehicule: newMatricule }
      });
      
      console.log(`✅ Updated tour ${tour.id}: ${tour.matricule_vehicule} → ${newMatricule}`);
      updated++;
    }
  }

  // Update drivers' default matricules
  const drivers = await prisma.driver.findMany();
  
  for (const driver of drivers) {
    if (driver.matricule_par_defaut && !driver.matricule_par_defaut.includes('تونس')) {
      const match = driver.matricule_par_defaut.match(/(\d+)/g);
      let newMatricule = driver.matricule_par_defaut;
      
      if (match && match.length >= 2) {
        const serie = match[0].padStart(3, '0').slice(0, 3);
        const unique = match[1].padStart(4, '0').slice(0, 4);
        newMatricule = `${serie} تونس ${unique}`;
      }
      
      await prisma.driver.update({
        where: { id: driver.id },
        data: { matricule_par_defaut: newMatricule }
      });
      
      console.log(`✅ Updated driver ${driver.nom_complet}: ${driver.matricule_par_defaut} → ${newMatricule}`);
    }
  }

  console.log(`\n✅ Migration complete! Updated ${updated} tours`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
