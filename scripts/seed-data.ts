import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with test data...\n');

  // Create Drivers
  console.log('👨‍✈️ Creating drivers...');
  const drivers = await Promise.all([
    prisma.driver.upsert({
      where: { id: '1' },
      update: {},
      create: {
        id: '1',
        nom_complet: 'Mohamed Ben Ali',
        matricule_par_defaut: '238 تونس 8008',
        tolerance_caisses_mensuelle: 5,
      },
    }),
    prisma.driver.upsert({
      where: { id: '2' },
      update: {},
      create: {
        id: '2',
        nom_complet: 'Ahmed Trabelsi',
        matricule_par_defaut: '225 تونس 4521',
        tolerance_caisses_mensuelle: 3,
      },
    }),
    prisma.driver.upsert({
      where: { id: '3' },
      update: {},
      create: {
        id: '3',
        nom_complet: 'Youssef Hammami',
        matricule_par_defaut: '212 تونس 7899',
        tolerance_caisses_mensuelle: 4,
      },
    }),
  ]);
  console.log(`✅ Created ${drivers.length} drivers\n`);

  // Create Secteurs
  console.log('🗺️  Creating secteurs...');
  const secteurs = await Promise.all([
    prisma.secteur.upsert({
      where: { id: '1' },
      update: {},
      create: {
        id: '1',
        nom: 'Tunis Centre',
      },
    }),
    prisma.secteur.upsert({
      where: { id: '2' },
      update: {},
      create: {
        id: '2',
        nom: 'Ariana',
      },
    }),
    prisma.secteur.upsert({
      where: { id: '3' },
      update: {},
      create: {
        id: '3',
        nom: 'Ben Arous',
      },
    }),
    prisma.secteur.upsert({
      where: { id: '4' },
      update: {},
      create: {
        id: '4',
        nom: 'Manouba',
      },
    }),
    prisma.secteur.upsert({
      where: { id: '5' },
      update: {},
      create: {
        id: '5',
        nom: 'Sfax',
      },
    }),
  ]);
  console.log(`✅ Created ${secteurs.length} secteurs\n`);

  // Create Produits
  console.log('📦 Creating produits...');
  const produits = await Promise.all([
    prisma.produit.upsert({
      where: { id: '1' },
      update: {},
      create: {
        id: '1',
        code_article: 'ESC-001',
        nom: 'Escalope de Poulet',
      },
    }),
    prisma.produit.upsert({
      where: { id: '2' },
      update: {},
      create: {
        id: '2',
        code_article: 'CUI-001',
        nom: 'Cuisses de Poulet',
      },
    }),
    prisma.produit.upsert({
      where: { id: '3' },
      update: {},
      create: {
        id: '3',
        code_article: 'POI-001',
        nom: 'Poitrine de Poulet',
      },
    }),
    prisma.produit.upsert({
      where: { id: '4' },
      update: {},
      create: {
        id: '4',
        code_article: 'AIL-001',
        nom: 'Ailes de Poulet',
      },
    }),
    prisma.produit.upsert({
      where: { id: '5' },
      update: {},
      create: {
        id: '5',
        code_article: 'HAC-001',
        nom: 'Poulet Haché',
      },
    }),
  ]);
  console.log(`✅ Created ${produits.length} produits\n`);

  // Create CaisseConfig
  console.log('💰 Creating caisse config...');
  const caisseConfig = await prisma.caisseConfig.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      nom: 'Caisse Standard',
      valeur_tnd: 50, // 50 TND per caisse
    },
  });
  console.log(`✅ Caisse value set to ${caisseConfig.valeur_tnd} TND\n`);

  console.log('✅ Database seeded successfully!');
  console.log('\n📊 Summary:');
  console.log(`  - Drivers: ${drivers.length}`);
  console.log(`  - Secteurs: ${secteurs.length}`);
  console.log(`  - Produits: ${produits.length}`);
  console.log(`  - Caisse Value: ${caisseConfig.valeur_tnd} TND`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
