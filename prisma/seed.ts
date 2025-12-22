import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');
  console.log('');
  console.log('='.repeat(60));
  console.log('🧹 CLEANING DATABASE');
  console.log('='.repeat(60));

  // Clear all data (in order to respect foreign keys)
  await prisma.notification.deleteMany();
  console.log('   ✓ Notifications cleared');
  await prisma.auditLog.deleteMany();
  console.log('   ✓ Audit logs cleared');
  await prisma.conflict.deleteMany();
  console.log('   ✓ Conflicts cleared');
  await prisma.ligneRetourProduit.deleteMany();
  console.log('   ✓ Ligne retour produits cleared');
  await prisma.tour.deleteMany();
  console.log('   ✓ Tours cleared');
  await prisma.produit.deleteMany();
  console.log('   ✓ Produits cleared');
  await prisma.driver.deleteMany();
  console.log('   ✓ Drivers cleared');
  await prisma.secteur.deleteMany();
  console.log('   ✓ Secteurs cleared');
  await prisma.wiFiConfig.deleteMany();
  console.log('   ✓ WiFi configs cleared');
  await prisma.caisseConfig.deleteMany();
  console.log('   ✓ Caisse configs cleared');
  await prisma.session.deleteMany();
  console.log('   ✓ Sessions cleared');
  await prisma.account.deleteMany();
  console.log('   ✓ Accounts cleared');
  await prisma.user.deleteMany();
  console.log('   ✓ Users cleared');

  console.log('');
  console.log('='.repeat(60));
  console.log('👥 CREATING USERS');
  console.log('='.repeat(60));

  // Hash password with bcrypt (compatible with BetterAuth configured with bcrypt)
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

    console.log(`   ✓ ${data.email} (${data.role})`);
    return user;
  }

  // Create all users
  await createUserWithAccount({
    name: 'Administrateur',
    email: 'admin@caisse.tn',
    role: 'ADMIN',
  });

  await createUserWithAccount({
    name: 'Directeur Principal',
    email: 'direction@caisse.tn',
    role: 'DIRECTION',
  });

  await createUserWithAccount({
    name: 'Directeur Adjoint',
    email: 'direction2@caisse.tn',
    role: 'DIRECTION',
  });

  await createUserWithAccount({
    name: 'Agent Contrôle 1',
    email: 'controle1@caisse.tn',
    role: 'AGENT_CONTROLE',
  });

  await createUserWithAccount({
    name: 'Agent Contrôle 2',
    email: 'controle2@caisse.tn',
    role: 'AGENT_CONTROLE',
  });

  await createUserWithAccount({
    name: 'Agent Hygiène 1',
    email: 'hygiene1@caisse.tn',
    role: 'AGENT_HYGIENE',
  });

  await createUserWithAccount({
    name: 'Agent Hygiène 2',
    email: 'hygiene2@caisse.tn',
    role: 'AGENT_HYGIENE',
  });

  await createUserWithAccount({
    name: 'Agent Sécurité 1',
    email: 'securite1@caisse.tn',
    role: 'SECURITE',
  });

  await createUserWithAccount({
    name: 'Agent Sécurité 2',
    email: 'securite2@caisse.tn',
    role: 'SECURITE',
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('⚙️ CREATING DEFAULT CONFIGURATION');
  console.log('='.repeat(60));

  // Create default WiFi Config
  await prisma.wiFiConfig.create({
    data: {
      ssid: 'CAISSE_ENTREPOT',
      bssid: 'AA:BB:CC:DD:EE:FF',
      description: 'WiFi principal entrepôt',
      isActive: true,
    },
  });
  console.log('   ✓ WiFi config created');

  // Create default Caisse Config
  await prisma.caisseConfig.create({
    data: {
      nom: 'Caisse Standard',
      valeur_tnd: 15.0,
    },
  });
  console.log('   ✓ Caisse config created (15 TND/caisse)');

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ SEED COMPLETED SUCCESSFULLY');
  console.log('='.repeat(60));

  console.log('');
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│                    ALL USER CREDENTIALS                    │');
  console.log('├────────────────────────────┬────────────────┬──────────────┤');
  console.log('│ Email                      │ Password       │ Role         │');
  console.log('├────────────────────────────┼────────────────┼──────────────┤');
  console.log('│ admin@caisse.tn            │ password123    │ ADMIN        │');
  console.log('│ direction@caisse.tn        │ password123    │ DIRECTION    │');
  console.log('│ direction2@caisse.tn       │ password123    │ DIRECTION    │');
  console.log('│ controle1@caisse.tn        │ password123    │ AGENT_CTRL   │');
  console.log('│ controle2@caisse.tn        │ password123    │ AGENT_CTRL   │');
  console.log('│ hygiene1@caisse.tn         │ password123    │ AGENT_HYG    │');
  console.log('│ hygiene2@caisse.tn         │ password123    │ AGENT_HYG    │');
  console.log('│ securite1@caisse.tn        │ password123    │ SECURITE     │');
  console.log('│ securite2@caisse.tn        │ password123    │ SECURITE     │');
  console.log('└────────────────────────────┴────────────────┴──────────────┘');

  console.log('');
  console.log('🎯 QUICK ACCESS:');
  console.log('');
  console.log('   🌐 Web Dashboard: http://localhost:3000');
  console.log('      → Admin: admin@caisse.tn');
  console.log('      → Direction: direction@caisse.tn');
  console.log('');
  console.log('   📱 Mobile App (via Backend API on :3001):');
  console.log('      → Contrôle: controle1@caisse.tn');
  console.log('      → Hygiène: hygiene1@caisse.tn');
  console.log('      → Sécurité: securite1@caisse.tn');
  console.log('');
  console.log('   ℹ️  Tours, Drivers, Secteurs, Produits must be added manually.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
