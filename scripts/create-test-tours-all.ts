import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚚 Creating additional test tours...\n');

  // Delete existing test tours first
  await prisma.tour.deleteMany({
    where: {
      matricule_vehicule: {
        in: ['238 تونس 8008', '225 تونس 4521', '212 تونس 7899']
      }
    }
  });
  console.log('🗑️  Deleted existing test tours\n');

  const driver = await prisma.driver.findFirst();
  const secteur = await prisma.secteur.findFirst({ skip: 1 });
  const agentControle = await prisma.user.findFirst({
    where: { role: 'AGENT_CONTROLE' },
  });

  if (!driver || !secteur || !agentControle) {
    console.log('❌ Missing required data');
    return;
  }

  // Tour for Agent Contrôle (retour)
  const tourRetour = await prisma.tour.create({
    data: {
      driverId: driver.id,
      matricule_vehicule: '238 تونس 8008',
      secteurId: secteur.id,
      nbre_caisses_depart: 60,
      nbre_caisses_retour: null,
      poids_net_produits_depart: 600,
      poids_brut_securite_sortie: 1200,
      poids_brut_securite_retour: 800,
      statut: 'EN_ATTENTE_DECHARGEMENT',
      agentControleId: agentControle.id,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      date_sortie_securite: new Date(Date.now() - 3600000),
      date_entree_securite: new Date(),
    },
  });

  console.log('✅ Tour for Agent Contrôle created:');
  console.log(`  - Matricule: ${tourRetour.matricule_vehicule}`);
  console.log(`  - Status: ${tourRetour.statut}`);

  // Tour ready for Agent Hygiène (EN_ATTENTE_HYGIENE - with chicken products)
  const tourHygiene = await prisma.tour.create({
    data: {
      driverId: driver.id,
      matricule_vehicule: '212 تونس 7899',
      secteurId: secteur.id,
      nbre_caisses_depart: 50,
      nbre_caisses_retour: 48,
      poids_net_produits_depart: 500,
      poids_brut_securite_sortie: 1100,
      poids_brut_securite_retour: 750,
      statut: 'EN_ATTENTE_HYGIENE',
      agentControleId: agentControle.id,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      photo_preuve_retour_url: 'test_photo_retour_url',
      date_sortie_securite: new Date(Date.now() - 7200000),
      date_entree_securite: new Date(Date.now() - 3600000),
    },
  });

  console.log('\n✅ Tour for Agent Hygiène created:');
  console.log(`  - Matricule: ${tourHygiene.matricule_vehicule}`);
  console.log(`  - Status: ${tourHygiene.statut} (retour with chicken products)`);

  // Tour for Agent Hygiène (nettoyage)
  const tourNettoyage = await prisma.tour.create({
    data: {
      driverId: driver.id,
      matricule_vehicule: '225 تونس 4521',
      secteurId: secteur.id,
      nbre_caisses_depart: 40,
      nbre_caisses_retour: 40,
      poids_net_produits_depart: 400,
      poids_brut_securite_sortie: 1000,
      poids_brut_securite_retour: 650,
      statut: 'EN_ATTENTE_HYGIENE',
      agentControleId: agentControle.id,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      photo_preuve_retour_url: 'test_photo_url',
      date_sortie_securite: new Date(Date.now() - 7200000),
      date_entree_securite: new Date(Date.now() - 1800000),
    },
  });

  console.log('\n✅ Tour for cleaning created:');
  console.log(`  - Matricule: ${tourNettoyage.matricule_vehicule}`);
  console.log(`  - Status: ${tourNettoyage.statut}`);

  console.log('\n📋 Testing Summary:');
  console.log('  - Agent Contrôle (Retour): 238 تونس 8008 (EN_ATTENTE_DECHARGEMENT)');
  console.log('  - Agent Hygiène (Inspection): 212 تونس 7899 (EN_ATTENTE_HYGIENE) 🐔');
  console.log('  - Agent Hygiène (Cleaning): 225 تونس 4521 (EN_ATTENTE_HYGIENE)');
  console.log('\n💡 Use agent@test.com to test Agent Contrôle workflow');
  console.log('💡 Use hygiene@test.com to test Agent Hygiène workflow');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
