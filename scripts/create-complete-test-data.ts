import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Creating complete test data for all workflows...\n');

  // Clean up existing test tours
  await prisma.conflict.deleteMany();
  await prisma.tour.deleteMany();
  
  console.log('🗑️  Cleaned existing tours and conflicts\n');

  // Get or create drivers with proper Tunisian matricules
  const drivers = await prisma.driver.findMany();
  if (drivers.length === 0) {
    throw new Error('No drivers found. Run seed script first.');
  }

  const driver1 = drivers[0]; // Ahmed Trabelsi - tolerance 5
  const driver2 = drivers[1]; // Mohamed Ben Ali - tolerance 3
  const driver3 = drivers[2]; // Youssef Hammami - tolerance 2

  // Get secteurs
  const secteurs = await prisma.secteur.findMany();
  if (secteurs.length === 0) {
    throw new Error('No secteurs found. Run seed script first.');
  }

  const secteur1 = secteurs[0]; // Tunis Centre
  const secteur2 = secteurs[1]; // Ariana

  // Get users
  const agentControle = await prisma.user.findFirst({ where: { role: 'AGENT_CONTROLE' } });
  const agentHygiene = await prisma.user.findFirst({ where: { role: 'AGENT_HYGIENE' } });
  const securite = await prisma.user.findFirst({ where: { role: 'SECURITE' } });

  if (!agentControle || !agentHygiene || !securite) {
    throw new Error('Required users not found. Run seed script first.');
  }

  console.log('📋 Creating test tours for complete workflow:\n');

  // ==================== 1. Tour for Agent Contrôle to CREATE ====================
  // This tour is in PREPARATION - Agent Contrôle can create new ones
  console.log('1️⃣  PREPARATION Tour (for testing create functionality)');
  const tourPreparation = await prisma.tour.create({
    data: {
      driverId: driver1.id,
      matricule_vehicule: '253 تونس 1001',
      secteurId: secteur1.id,
      nbre_caisses_depart: 50,
      poids_net_produits_depart: 500,
      photo_preuve_depart_url: 'test_photo_depart_1.jpg',
      statut: 'PREPARATION',
      agentControleId: agentControle.id,
    },
  });
  console.log(`   ✅ Created: ${tourPreparation.matricule_vehicule} - PREPARATION`);

  // ==================== 2. Tour READY TO DEPART (for Sécurité) ====================
  console.log('\n2️⃣  PRET_A_PARTIR Tour (for Sécurité - Pesée Sortie)');
  const tourPretAPartir = await prisma.tour.create({
    data: {
      driverId: driver2.id,
      matricule_vehicule: '254 تونس 2002',
      secteurId: secteur2.id,
      nbre_caisses_depart: 60,
      poids_net_produits_depart: 600,
      photo_preuve_depart_url: 'test_photo_depart_2.jpg',
      statut: 'PRET_A_PARTIR',
      agentControleId: agentControle.id,
    },
  });
  console.log(`   ✅ Created: ${tourPretAPartir.matricule_vehicule} - PRET_A_PARTIR`);

  // ==================== 3. Tour EN_TOURNEE (for Sécurité - Pesée Entrée) ====================
  console.log('\n3️⃣  EN_TOURNEE Tour (for Sécurité - Pesée Entrée)');
  const tourEnTournee = await prisma.tour.create({
    data: {
      driverId: driver3.id,
      matricule_vehicule: '255 تونس 3003',
      secteurId: secteur1.id,
      nbre_caisses_depart: 45,
      poids_net_produits_depart: 450,
      photo_preuve_depart_url: 'test_photo_depart_3.jpg',
      statut: 'EN_TOURNEE',
      agentControleId: agentControle.id,
      securiteIdSortie: securite.id,
      poids_brut_securite_sortie: 1150,
      matricule_verifie_sortie: true,
      date_sortie_securite: new Date(Date.now() - 7200000), // 2 hours ago
    },
  });
  console.log(`   ✅ Created: ${tourEnTournee.matricule_vehicule} - EN_TOURNEE`);

  // ==================== 4. Tour EN_ATTENTE_DECHARGEMENT (for Agent Contrôle - Retour) ====================
  console.log('\n4️⃣  EN_ATTENTE_DECHARGEMENT Tour (for Agent Contrôle - Retour with chicken)');
  const tourAttenteRetour = await prisma.tour.create({
    data: {
      driverId: driver1.id,
      matricule_vehicule: '256 تونس 4004',
      secteurId: secteur2.id,
      nbre_caisses_depart: 55,
      poids_net_produits_depart: 550,
      photo_preuve_depart_url: 'test_photo_depart_4.jpg',
      statut: 'EN_ATTENTE_DECHARGEMENT',
      agentControleId: agentControle.id,
      securiteIdSortie: securite.id,
      securiteIdEntree: securite.id,
      poids_brut_securite_sortie: 1200,
      poids_brut_securite_retour: 850,
      poids_tare_securite: 200,
      poids_net_total_calcule: 650,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      date_sortie_securite: new Date(Date.now() - 10800000), // 3 hours ago
      date_entree_securite: new Date(Date.now() - 1800000), // 30 min ago
    },
  });
  console.log(`   ✅ Created: ${tourAttenteRetour.matricule_vehicule} - EN_ATTENTE_DECHARGEMENT`);

  // ==================== 5. Tour EN_ATTENTE_DECHARGEMENT WITHOUT CHICKEN (direct terminate) ====================
  console.log('\n5️⃣  EN_ATTENTE_DECHARGEMENT Tour (for Agent Contrôle - NO chicken, direct terminate)');
  const tourSansPoulet = await prisma.tour.create({
    data: {
      driverId: driver2.id,
      matricule_vehicule: '257 تونس 5005',
      secteurId: secteur1.id,
      nbre_caisses_depart: 40,
      poids_net_produits_depart: 400,
      photo_preuve_depart_url: 'test_photo_depart_5.jpg',
      statut: 'EN_ATTENTE_DECHARGEMENT',
      agentControleId: agentControle.id,
      securiteIdSortie: securite.id,
      securiteIdEntree: securite.id,
      poids_brut_securite_sortie: 1000,
      poids_brut_securite_retour: 700,
      poids_tare_securite: 200,
      poids_net_total_calcule: 500,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      date_sortie_securite: new Date(Date.now() - 14400000), // 4 hours ago
      date_entree_securite: new Date(Date.now() - 3600000), // 1 hour ago
    },
  });
  console.log(`   ✅ Created: ${tourSansPoulet.matricule_vehicule} - EN_ATTENTE_DECHARGEMENT (no chicken)`);

  // ==================== 6. Tour EN_ATTENTE_HYGIENE (for Agent Hygiène) ====================
  console.log('\n6️⃣  EN_ATTENTE_HYGIENE Tour (for Agent Hygiène - Inspection)');
  const tourAttenteHygiene = await prisma.tour.create({
    data: {
      driverId: driver3.id,
      matricule_vehicule: '258 تونس 6006',
      secteurId: secteur2.id,
      nbre_caisses_depart: 50,
      nbre_caisses_retour: 48, // 2 missing - creates conflict
      poids_net_produits_depart: 500,
      photo_preuve_depart_url: 'test_photo_depart_6.jpg',
      photo_preuve_retour_url: 'test_photo_retour_6.jpg',
      statut: 'EN_ATTENTE_HYGIENE',
      agentControleId: agentControle.id,
      securiteIdSortie: securite.id,
      securiteIdEntree: securite.id,
      poids_brut_securite_sortie: 1100,
      poids_brut_securite_retour: 750,
      poids_tare_securite: 200,
      poids_net_total_calcule: 550,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      date_sortie_securite: new Date(Date.now() - 18000000), // 5 hours ago
      date_entree_securite: new Date(Date.now() - 7200000), // 2 hours ago
    },
  });
  
  // Create conflict for this tour (2 missing caisses, within tolerance)
  await prisma.conflict.create({
    data: {
      tourId: tourAttenteHygiene.id,
      quantite_perdue: 2,
      montant_dette_tnd: 100, // 50 TND per caisse
      depasse_tolerance: false, // Driver has tolerance of 2
      statut: 'EN_ATTENTE',
    },
  });
  
  console.log(`   ✅ Created: ${tourAttenteHygiene.matricule_vehicule} - EN_ATTENTE_HYGIENE (with conflict)`);

  // ==================== 7. Tour with CONFLICT exceeding tolerance (for Direction) ====================
  console.log('\n7️⃣  TERMINEE Tour with CONFLICT (for Direction approval)');
  const tourConflict = await prisma.tour.create({
    data: {
      driverId: driver2.id, // Tolerance 3
      matricule_vehicule: '259 تونس 7007',
      secteurId: secteur1.id,
      nbre_caisses_depart: 50,
      nbre_caisses_retour: 45, // 5 missing - exceeds tolerance
      poids_net_produits_depart: 500,
      photo_preuve_depart_url: 'test_photo_depart_7.jpg',
      photo_preuve_retour_url: 'test_photo_retour_7.jpg',
      statut: 'TERMINEE',
      agentControleId: agentControle.id,
      agentHygieneId: agentHygiene.id,
      securiteIdSortie: securite.id,
      securiteIdEntree: securite.id,
      poids_brut_securite_sortie: 1100,
      poids_brut_securite_retour: 720,
      poids_tare_securite: 200,
      poids_net_total_calcule: 520,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      statut_hygiene: 'APPROUVE',
      photos_hygiene_urls: ['hygiene_photo_1.jpg', 'hygiene_photo_2.jpg'],
      date_sortie_securite: new Date(Date.now() - 28800000), // 8 hours ago
      date_entree_securite: new Date(Date.now() - 14400000), // 4 hours ago
    },
  });

  // Create major conflict
  await prisma.conflict.create({
    data: {
      tourId: tourConflict.id,
      quantite_perdue: 5,
      montant_dette_tnd: 250, // 50 TND per caisse
      depasse_tolerance: true, // Exceeds tolerance of 3
      statut: 'EN_ATTENTE',
    },
  });

  console.log(`   ✅ Created: ${tourConflict.matricule_vehicule} - TERMINEE (major conflict)`);

  // ==================== 8. Completed tour with no issues ====================
  console.log('\n8️⃣  TERMINEE Tour (successful completion, no conflicts)');
  const tourCompleted = await prisma.tour.create({
    data: {
      driverId: driver1.id,
      matricule_vehicule: '260 تونس 8008',
      secteurId: secteur2.id,
      nbre_caisses_depart: 45,
      nbre_caisses_retour: 45, // Perfect return
      poids_net_produits_depart: 450,
      photo_preuve_depart_url: 'test_photo_depart_8.jpg',
      photo_preuve_retour_url: 'test_photo_retour_8.jpg',
      statut: 'TERMINEE',
      agentControleId: agentControle.id,
      agentHygieneId: agentHygiene.id,
      securiteIdSortie: securite.id,
      securiteIdEntree: securite.id,
      poids_brut_securite_sortie: 1050,
      poids_brut_securite_retour: 700,
      poids_tare_securite: 200,
      poids_net_total_calcule: 500,
      matricule_verifie_sortie: true,
      matricule_verifie_retour: true,
      statut_hygiene: 'APPROUVE',
      photos_hygiene_urls: ['hygiene_photo_success_1.jpg'],
      notes_hygiene: 'Excellent état, aucun problème',
      date_sortie_securite: new Date(Date.now() - 43200000), // 12 hours ago
      date_entree_securite: new Date(Date.now() - 21600000), // 6 hours ago
    },
  });

  console.log(`   ✅ Created: ${tourCompleted.matricule_vehicule} - TERMINEE (perfect)`);

  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST DATA SUMMARY');
  console.log('='.repeat(80));
  
  const allTours = await prisma.tour.findMany({
    include: { driver: true, secteur: true, conflicts: true }
  });

  console.log('\n🚗 TOURS BY STATUS:');
  const statusGroups = allTours.reduce((acc: any, tour) => {
    acc[tour.statut] = (acc[tour.statut] || 0) + 1;
    return acc;
  }, {});

  Object.entries(statusGroups).forEach(([status, count]) => {
    console.log(`   ${status}: ${count} tour(s)`);
  });

  console.log('\n⚠️  CONFLICTS:');
  const conflicts = await prisma.conflict.findMany({
    include: { tour: true }
  });
  console.log(`   Total conflicts: ${conflicts.length}`);
  console.log(`   Pending approval: ${conflicts.filter(c => c.statut === 'EN_ATTENTE').length}`);
  console.log(`   Exceeding tolerance: ${conflicts.filter(c => c.depasse_tolerance).length}`);

  console.log('\n👥 TEST USERS:');
  console.log('   📧 agent@test.com / agent123 (AGENT_CONTROLE)');
  console.log('   📧 hygiene@test.com / hygiene123 (AGENT_HYGIENE)');
  console.log('   📧 securite@test.com / securite123 (SECURITE)');
  console.log('   📧 direction@test.com / direction123 (DIRECTION)');
  console.log('   📧 admin@test.com / admin123 (ADMIN)');

  console.log('\n🧪 TESTING WORKFLOW:');
  console.log('   1. Sécurité → Process tour 254 تونس 2002 (Pesée Sortie)');
  console.log('   2. Sécurité → Process tour 255 تونس 3003 (Pesée Entrée)');
  console.log('   3. Agent Contrôle → Create new tour (starts at 261 تونس XXXX)');
  console.log('   4. Agent Contrôle → Process tour 256 تونس 4004 (with chicken → Hygiène)');
  console.log('   5. Agent Contrôle → Process tour 257 تونس 5005 (no chicken → Terminée)');
  console.log('   6. Agent Hygiène → Inspect tour 258 تونس 6006 (approve/reject)');
  console.log('   7. Direction → Approve conflict for tour 259 تونس 7007');

  console.log('\n✅ Complete test data created successfully!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
