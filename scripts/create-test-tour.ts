import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚚 Creating test tour...\n');

  // Get a driver
  const driver = await prisma.driver.findFirst();
  if (!driver) {
    console.log('❌ No drivers found. Please run seed-data.ts first.');
    return;
  }

  // Get a secteur
  const secteur = await prisma.secteur.findFirst();
  if (!secteur) {
    console.log('❌ No secteurs found. Please run seed-data.ts first.');
    return;
  }

  // Get agent controle user
  const agentControle = await prisma.user.findFirst({
    where: { role: 'AGENT_CONTROLE' },
  });
  if (!agentControle) {
    console.log('❌ No Agent Contrôle found.');
    return;
  }

  // Create a tour ready to depart
  const tour = await prisma.tour.create({
    data: {
      driverId: driver.id,
      matricule_vehicule: driver.matricule_par_defaut || '200 تونس 0000',
      secteurId: secteur.id,
      nbre_caisses_depart: 50,
      poids_net_produits_depart: 500, // 500 kg of products
      statut: 'PRET_A_PARTIR',
      agentControleId: agentControle.id,
      matricule_verifie_sortie: false,
      matricule_verifie_retour: false,
    },
  });

  console.log('✅ Test tour created successfully!');
  console.log('\n📋 Tour Details:');
  console.log(`  - ID: ${tour.id}`);
  console.log(`  - Driver: ${driver.nom_complet}`);
  console.log(`  - Matricule: ${tour.matricule_vehicule}`);
  console.log(`  - Secteur: ${secteur.nom}`);
  console.log(`  - Caisses: ${tour.nbre_caisses_depart}`);
  console.log(`  - Status: ${tour.statut}`);
  console.log('\n✅ You can now test the Sécurité module by searching for matricule:');
  console.log(`   ${tour.matricule_vehicule}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
