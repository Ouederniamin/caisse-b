import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tunisianGovernorates = [
  'Tunis',
  'Ariana',
  'Ben Arous',
  'Manouba',
  'Nabeul',
  'Zaghouan',
  'Bizerte',
  'Béja',
  'Jendouba',
  'Le Kef',
  'Siliana',
  'Sousse',
  'Monastir',
  'Mahdia',
  'Sfax',
  'Kairouan',
  'Kasserine',
  'Sidi Bouzid',
  'Gabès',
  'Médenine',
  'Tataouine',
  'Gafsa',
  'Tozeur',
  'Kébili'
];

async function seedTunisianSecteurs() {
  try {
    console.log('🇹🇳 Starting to seed Tunisian governorates as secteurs...\n');

    // First, clear existing secteurs
    const deleted = await prisma.secteur.deleteMany({});
    console.log(`🗑️  Deleted ${deleted.count} existing secteurs\n`);

    // Create all 24 governorates
    let created = 0;
    for (const nom of tunisianGovernorates) {
      await prisma.secteur.create({
        data: { nom }
      });
      console.log(`✅ Created secteur: ${nom}`);
      created++;
    }

    console.log(`\n✨ Successfully created ${created} Tunisian governorates as secteurs!`);

    // Verify
    const total = await prisma.secteur.count();
    console.log(`\n📊 Total secteurs in database: ${total}`);

  } catch (error) {
    console.error('❌ Error seeding secteurs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTunisianSecteurs()
  .then(() => {
    console.log('\n✅ Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
