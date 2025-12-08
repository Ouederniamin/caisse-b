import { PrismaClient, TourStatus, ConflictStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data (in order to respect foreign keys)
  console.log('🧹 Cleaning database...');
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.conflict.deleteMany();
  await prisma.ligneRetourProduit.deleteMany();
  await prisma.tour.deleteMany();
  await prisma.produit.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.secteur.deleteMany();
  await prisma.wiFiConfig.deleteMany();
  await prisma.caisseConfig.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // Create Secteurs
  console.log('📍 Creating secteurs...');
  const secteurs = await Promise.all([
    prisma.secteur.create({ data: { nom: 'Tunis Centre' } }),
    prisma.secteur.create({ data: { nom: 'Ariana' } }),
    prisma.secteur.create({ data: { nom: 'Ben Arous' } }),
    prisma.secteur.create({ data: { nom: 'La Marsa' } }),
    prisma.secteur.create({ data: { nom: 'Sousse' } }),
    prisma.secteur.create({ data: { nom: 'Sfax' } }),
  ]);

  // Create Drivers with various tolerance levels
  console.log('🚗 Creating drivers...');
  const drivers = await Promise.all([
    prisma.driver.create({ data: { nom_complet: 'Ahmed Ben Ali', matricule_par_defaut: 'TU-1234', tolerance_caisses_mensuelle: 5 } }),
    prisma.driver.create({ data: { nom_complet: 'Mohamed Trabelsi', matricule_par_defaut: 'TU-5678', tolerance_caisses_mensuelle: 3 } }),
    prisma.driver.create({ data: { nom_complet: 'Karim Bouazizi', matricule_par_defaut: 'TU-9012', tolerance_caisses_mensuelle: 10 } }),
    prisma.driver.create({ data: { nom_complet: 'Sami Jebali', matricule_par_defaut: 'AR-3456', tolerance_caisses_mensuelle: 2 } }),
    prisma.driver.create({ data: { nom_complet: 'Nizar Chahed', matricule_par_defaut: 'SF-7890', tolerance_caisses_mensuelle: 7 } }),
    prisma.driver.create({ data: { nom_complet: 'Fares Meddeb', matricule_par_defaut: 'BA-1122', tolerance_caisses_mensuelle: 4 } }),
    prisma.driver.create({ data: { nom_complet: 'Yassine Gharbi', matricule_par_defaut: 'LM-3344', tolerance_caisses_mensuelle: 6 } }),
  ]);

  // Create Users with different roles
  console.log('👥 Creating users...');
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  // Helper function to create user with BetterAuth account
  async function createUserWithAccount(data: {
    name: string;
    email: string;
    role: string;
  }) {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password_hash: hashedPassword,
        role: data.role,
        emailVerified: true,
      },
    });
    
    // Create BetterAuth credential account
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: hashedPassword,
      },
    });
    
    return user;
  }

  const users = await Promise.all([
    // Admin
    createUserWithAccount({
      name: 'Admin Principal',
      email: 'admin@caisse.tn',
      role: 'ADMIN',
    }),
    // Direction
    createUserWithAccount({
      name: 'Directeur Hamdi',
      email: 'direction@caisse.tn',
      role: 'DIRECTION',
    }),
    createUserWithAccount({
      name: 'Directeur Adjoint',
      email: 'direction2@caisse.tn',
      role: 'DIRECTION',
    }),
    // Agents Contrôle
    createUserWithAccount({
      name: 'Agent Contrôle Amine',
      email: 'controle1@caisse.tn',
      role: 'AGENT_CONTROLE',
    }),
    createUserWithAccount({
      name: 'Agent Contrôle Salah',
      email: 'controle2@caisse.tn',
      role: 'AGENT_CONTROLE',
    }),
    // Agents Hygiène
    createUserWithAccount({
      name: 'Agent Hygiène Fatma',
      email: 'hygiene1@caisse.tn',
      role: 'AGENT_HYGIENE',
    }),
    createUserWithAccount({
      name: 'Agent Hygiène Nadia',
      email: 'hygiene2@caisse.tn',
      role: 'AGENT_HYGIENE',
    }),
    // Sécurité
    createUserWithAccount({
      name: 'Agent Sécurité Bassem',
      email: 'securite1@caisse.tn',
      role: 'SECURITE',
    }),
    createUserWithAccount({
      name: 'Agent Sécurité Walid',
      email: 'securite2@caisse.tn',
      role: 'SECURITE',
    }),
  ]);

  const [admin, direction1, direction2, controle1, controle2, hygiene1, hygiene2, securite1, securite2] = users;

  // Create Produits
  console.log('📦 Creating produits...');
  const produits = await Promise.all([
    prisma.produit.create({ data: { code_article: 'TOMATE-01', nom: 'Tomates fraîches' } }),
    prisma.produit.create({ data: { code_article: 'POMME-01', nom: 'Pommes de terre' } }),
    prisma.produit.create({ data: { code_article: 'ORANGE-01', nom: 'Oranges' } }),
    prisma.produit.create({ data: { code_article: 'CITRON-01', nom: 'Citrons' } }),
    prisma.produit.create({ data: { code_article: 'SALADE-01', nom: 'Salade verte' } }),
    prisma.produit.create({ data: { code_article: 'CAROTTE-01', nom: 'Carottes' } }),
    prisma.produit.create({ data: { code_article: 'OIGNON-01', nom: 'Oignons' } }),
  ]);

  // Create WiFi Config
  console.log('📶 Creating WiFi config...');
  await prisma.wiFiConfig.create({
    data: {
      ssid: 'CAISSE_ENTREPOT',
      bssid: 'AA:BB:CC:DD:EE:FF',
      description: 'WiFi principal entrepôt',
      isActive: true,
    },
  });

  // Create Caisse Config
  console.log('💰 Creating caisse config...');
  await prisma.caisseConfig.create({
    data: {
      nom: 'Caisse Standard',
      valeur_tnd: 15.0,
    },
  });

  // Create Tours with various statuses
  console.log('🚚 Creating tours...');
  const now = new Date();
  const tours = [];

  // Helper to get random item
  const randomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  // Tours TERMINEE (completed) - 5 tours
  for (let i = 0; i < 5; i++) {
    const tour = await prisma.tour.create({
      data: {
        driverId: randomItem(drivers).id,
        secteurId: randomItem(secteurs).id,
        agentControleId: randomItem([controle1, controle2]).id,
        agentHygieneId: randomItem([hygiene1, hygiene2]).id,
        securiteIdSortie: securite1.id,
        securiteIdEntree: securite2.id,
        matricule_vehicule: `TU-${1000 + i}`,
        nbre_caisses_depart: 50 + Math.floor(Math.random() * 50),
        nbre_caisses_retour: 45 + Math.floor(Math.random() * 10),
        poids_net_produits_depart: 500 + Math.random() * 200,
        poids_brut_securite_sortie: 2500 + Math.random() * 500,
        poids_brut_securite_retour: 800 + Math.random() * 200,
        poids_tare_securite: 750,
        poids_net_total_calcule: 50 + Math.random() * 200,
        statut: TourStatus.TERMINEE,
        statut_hygiene: 'APPROUVE',
        matricule_verifie_sortie: true,
        matricule_verifie_retour: true,
        date_sortie_securite: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000),
        date_entree_securite: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000 - 10 * 60 * 60 * 1000),
      },
    });
    tours.push(tour);
  }

  // Tours EN_TOURNEE (in progress) - 3 tours
  for (let i = 0; i < 3; i++) {
    const tour = await prisma.tour.create({
      data: {
        driverId: drivers[i].id,
        secteurId: secteurs[i].id,
        agentControleId: controle1.id,
        securiteIdSortie: securite1.id,
        matricule_vehicule: `AR-${2000 + i}`,
        nbre_caisses_depart: 60 + Math.floor(Math.random() * 40),
        poids_net_produits_depart: 600 + Math.random() * 200,
        poids_brut_securite_sortie: 2800 + Math.random() * 400,
        poids_tare_securite: 750,
        statut: TourStatus.EN_TOURNEE,
        matricule_verifie_sortie: true,
        date_sortie_securite: new Date(now.getTime() - 4 * 60 * 60 * 1000), // 4 hours ago
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      },
    });
    tours.push(tour);
  }

  // Tours PRET_A_PARTIR - 2 tours
  for (let i = 0; i < 2; i++) {
    const tour = await prisma.tour.create({
      data: {
        driverId: drivers[3 + i].id,
        secteurId: secteurs[3 + i].id,
        agentControleId: controle2.id,
        matricule_vehicule: `BA-${3000 + i}`,
        nbre_caisses_depart: 45 + Math.floor(Math.random() * 30),
        poids_net_produits_depart: 450 + Math.random() * 150,
        statut: TourStatus.PRET_A_PARTIR,
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      },
    });
    tours.push(tour);
  }

  // Tours EN_ATTENTE_DECHARGEMENT - 2 tours
  for (let i = 0; i < 2; i++) {
    const tour = await prisma.tour.create({
      data: {
        driverId: drivers[5 + i].id,
        secteurId: secteurs[i].id,
        agentControleId: controle1.id,
        securiteIdSortie: securite1.id,
        securiteIdEntree: securite2.id,
        matricule_vehicule: `SF-${4000 + i}`,
        nbre_caisses_depart: 70 + Math.floor(Math.random() * 30),
        nbre_caisses_retour: 65 + Math.floor(Math.random() * 10),
        poids_net_produits_depart: 700 + Math.random() * 200,
        poids_brut_securite_sortie: 3000 + Math.random() * 500,
        poids_brut_securite_retour: 900 + Math.random() * 200,
        poids_tare_securite: 750,
        poids_net_total_calcule: 150 + Math.random() * 200,
        statut: TourStatus.EN_ATTENTE_DECHARGEMENT,
        matricule_verifie_sortie: true,
        matricule_verifie_retour: true,
        date_sortie_securite: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        date_entree_securite: new Date(now.getTime() - 30 * 60 * 1000),
        createdAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
      },
    });
    tours.push(tour);
  }

  // Tours EN_ATTENTE_HYGIENE - 2 tours
  for (let i = 0; i < 2; i++) {
    const tour = await prisma.tour.create({
      data: {
        driverId: drivers[i % drivers.length].id,
        secteurId: secteurs[(i + 2) % secteurs.length].id,
        agentControleId: controle2.id,
        securiteIdSortie: securite2.id,
        securiteIdEntree: securite1.id,
        matricule_vehicule: `LM-${5000 + i}`,
        nbre_caisses_depart: 55 + Math.floor(Math.random() * 25),
        nbre_caisses_retour: 52 + Math.floor(Math.random() * 8),
        poids_net_produits_depart: 550 + Math.random() * 150,
        poids_brut_securite_sortie: 2600 + Math.random() * 400,
        poids_brut_securite_retour: 850 + Math.random() * 150,
        poids_tare_securite: 750,
        poids_net_total_calcule: 100 + Math.random() * 150,
        statut: TourStatus.EN_ATTENTE_HYGIENE,
        matricule_verifie_sortie: true,
        matricule_verifie_retour: true,
        date_sortie_securite: new Date(now.getTime() - 5 * 60 * 60 * 1000),
        date_entree_securite: new Date(now.getTime() - 45 * 60 * 1000),
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      },
    });
    tours.push(tour);
  }

  // Tours PREPARATION - 1 tour
  const prepTour = await prisma.tour.create({
    data: {
      driverId: drivers[0].id,
      secteurId: secteurs[0].id,
      agentControleId: controle1.id,
      matricule_vehicule: 'TU-9999',
      nbre_caisses_depart: 40,
      poids_net_produits_depart: 400,
      statut: TourStatus.PREPARATION,
      createdAt: new Date(),
    },
  });
  tours.push(prepTour);

  // Create Conflicts
  console.log('⚠️ Creating conflicts...');
  
  // Conflict 1: En attente, within tolerance
  await prisma.conflict.create({
    data: {
      tourId: tours[0].id,
      quantite_perdue: 3,
      montant_dette_tnd: 45.0,
      statut: ConflictStatus.EN_ATTENTE,
      depasse_tolerance: false,
    },
  });

  // Conflict 2: En attente, exceeds tolerance
  await prisma.conflict.create({
    data: {
      tourId: tours[1].id,
      quantite_perdue: 8,
      montant_dette_tnd: 120.0,
      statut: ConflictStatus.EN_ATTENTE,
      depasse_tolerance: true,
    },
  });

  // Conflict 3: PAYEE
  await prisma.conflict.create({
    data: {
      tourId: tours[2].id,
      quantite_perdue: 5,
      montant_dette_tnd: 75.0,
      statut: ConflictStatus.PAYEE,
      notes_direction: 'Payé le 01/12/2024',
      direction_id_approbation: direction1.id,
      date_approbation_direction: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      depasse_tolerance: true,
    },
  });

  // Conflict 4: ANNULE
  await prisma.conflict.create({
    data: {
      tourId: tours[3].id,
      quantite_perdue: 2,
      montant_dette_tnd: 30.0,
      statut: ConflictStatus.ANNULE,
      notes_direction: 'Erreur de comptage confirmée',
      direction_id_approbation: direction2.id,
      date_approbation_direction: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      depasse_tolerance: false,
    },
  });

  // Conflict 5: En attente, large quantity
  await prisma.conflict.create({
    data: {
      tourId: tours[4].id,
      quantite_perdue: 12,
      montant_dette_tnd: 180.0,
      statut: ConflictStatus.EN_ATTENTE,
      depasse_tolerance: true,
    },
  });

  // Conflict 6: En attente, small quantity
  await prisma.conflict.create({
    data: {
      tourId: tours[10].id,
      quantite_perdue: 1,
      montant_dette_tnd: 15.0,
      statut: ConflictStatus.EN_ATTENTE,
      depasse_tolerance: false,
    },
  });

  // Conflict 7: PAYEE (recent)
  await prisma.conflict.create({
    data: {
      tourId: tours[11].id,
      quantite_perdue: 4,
      montant_dette_tnd: 60.0,
      statut: ConflictStatus.PAYEE,
      notes_direction: 'Réglé par virement',
      direction_id_approbation: direction1.id,
      date_approbation_direction: new Date(),
      depasse_tolerance: false,
    },
  });

  // Create Notifications for Direction users
  console.log('🔔 Creating notifications...');
  await Promise.all([
    prisma.notification.create({
      data: {
        userId: direction1.id,
        message: 'Nouveau conflit détecté: 8 caisses perdues par Mohamed Trabelsi',
        isRead: false,
      },
    }),
    prisma.notification.create({
      data: {
        userId: direction1.id,
        message: 'Conflit approuvé: Ahmed Ben Ali - 3 caisses',
        isRead: true,
      },
    }),
    prisma.notification.create({
      data: {
        userId: direction2.id,
        message: 'Alerte: Sami Jebali dépasse sa tolérance mensuelle',
        isRead: false,
      },
    }),
    prisma.notification.create({
      data: {
        userId: direction1.id,
        message: 'Tournée terminée: Karim Bouazizi - Sousse',
        isRead: true,
      },
    }),
    prisma.notification.create({
      data: {
        userId: direction2.id,
        message: 'Nouveau conflit détecté: 12 caisses perdues',
        isRead: false,
      },
    }),
  ]);

  // Create some LigneRetourProduit for completed tours
  console.log('📋 Creating ligne retour produits...');
  for (let i = 0; i < 5; i++) {
    const tour = tours[i];
    await Promise.all([
      prisma.ligneRetourProduit.create({
        data: {
          tourId: tour.id,
          produitId: produits[0].id,
          nbre_caisses: 15 + Math.floor(Math.random() * 10),
          poids_brut_retour: 150 + Math.random() * 50,
          poids_net_retour: 140 + Math.random() * 50,
        },
      }),
      prisma.ligneRetourProduit.create({
        data: {
          tourId: tour.id,
          produitId: produits[1].id,
          nbre_caisses: 10 + Math.floor(Math.random() * 10),
          poids_brut_retour: 120 + Math.random() * 40,
          poids_net_retour: 110 + Math.random() * 40,
        },
      }),
      prisma.ligneRetourProduit.create({
        data: {
          tourId: tour.id,
          produitId: produits[2].id,
          nbre_caisses: 8 + Math.floor(Math.random() * 8),
          poids_brut_retour: 80 + Math.random() * 30,
          poids_net_retour: 75 + Math.random() * 30,
        },
      }),
    ]);
  }

  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   - ${secteurs.length} secteurs`);
  console.log(`   - ${drivers.length} drivers`);
  console.log(`   - ${users.length} users`);
  console.log(`   - ${produits.length} produits`);
  console.log(`   - ${tours.length} tours`);
  console.log(`   - 7 conflicts`);
  console.log(`   - 5 notifications`);
  console.log('');
  console.log('🔑 Test Credentials (all use password: password123):');
  console.log('   - Admin: admin@caisse.tn');
  console.log('   - Direction: direction@caisse.tn');
  console.log('   - Agent Contrôle: controle1@caisse.tn');
  console.log('   - Agent Hygiène: hygiene1@caisse.tn');
  console.log('   - Sécurité: securite1@caisse.tn');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
