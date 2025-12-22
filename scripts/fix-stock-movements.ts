/**
 * Fix missing stock movements for tours that already have caisses loaded
 * This script adds DEPART_TOURNEE movements for tours that were created
 * before the stock movement logic was added to the chargement endpoint.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixStockMovements() {
  console.log('🔧 Fixing missing stock movements...\n');
  
  // Find all tours with caisses that don't have a corresponding DEPART_TOURNEE movement
  const tours = await prisma.tour.findMany({
    where: {
      nbre_caisses_depart: { gt: 0 }
    },
    include: {
      driver: true,
      secteur: true,
      agentControle: true,
    }
  });
  
  console.log(`Found ${tours.length} tours with caisses loaded\n`);
  
  // Check which tours already have DEPART_TOURNEE movements
  const existingMovements = await prisma.mouvementCaisse.findMany({
    where: {
      type: 'DEPART_TOURNEE',
      tourId: { in: tours.map(t => t.id) }
    }
  });
  
  const toursWithMovements = new Set(existingMovements.map(m => m.tourId));
  
  // Filter to tours that don't have movements yet
  const toursWithoutMovements = tours.filter(t => !toursWithMovements.has(t.id));
  
  console.log(`Found ${toursWithoutMovements.length} tours missing DEPART_TOURNEE movements\n`);
  
  if (toursWithoutMovements.length === 0) {
    console.log('✅ All tours already have proper stock movements');
    return;
  }
  
  // Get current stock
  const stock = await prisma.stockCaisse.findUnique({
    where: { id: 'stock-principal' }
  });
  
  if (!stock) {
    console.log('❌ Stock not initialized. Please initialize stock first.');
    return;
  }
  
  console.log(`Current stock: ${stock.stock_actuel} caisses\n`);
  
  // Calculate total caisses that should have been deducted
  const totalMissingDeductions = toursWithoutMovements.reduce((sum, t) => sum + (t.nbre_caisses_depart || 0), 0);
  console.log(`Total caisses that should have been deducted: ${totalMissingDeductions}\n`);
  
  // Create movements for each tour
  let runningBalance = stock.stock_actuel;
  
  for (const tour of toursWithoutMovements) {
    const caisses = tour.nbre_caisses_depart || 0;
    runningBalance -= caisses;
    
    console.log(`Creating DEPART_TOURNEE for tour ${tour.id}:`);
    console.log(`  - Driver: ${tour.driver?.nom_complet || 'N/A'}`);
    console.log(`  - Caisses: ${caisses}`);
    console.log(`  - New balance: ${runningBalance}`);
    
    await prisma.mouvementCaisse.create({
      data: {
        type: 'DEPART_TOURNEE',
        quantite: -caisses,
        solde_apres: runningBalance,
        tourId: tour.id,
        userId: tour.agentControleId || undefined,
        notes: `[FIX] Chargement: ${caisses} caisses pour tournée - ${tour.driver?.nom_complet || 'Chauffeur'}`
      }
    });
    
    console.log(`  ✅ Movement created\n`);
  }
  
  // Update the actual stock balance
  console.log(`Updating stock balance from ${stock.stock_actuel} to ${runningBalance}...`);
  
  await prisma.stockCaisse.update({
    where: { id: 'stock-principal' },
    data: { stock_actuel: runningBalance }
  });
  
  console.log(`\n✅ Stock movements fixed!`);
  console.log(`  - Created ${toursWithoutMovements.length} DEPART_TOURNEE movements`);
  console.log(`  - Stock updated: ${stock.stock_actuel} → ${runningBalance}`);
}

fixStockMovements()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
