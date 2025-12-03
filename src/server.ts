import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import prisma from './lib/prisma';

dotenv.config();

const server = Fastify({
  logger: true
});

// Register plugins
server.register(cors, {
  origin: true // Allow all origins for dev, restrict in prod
});

server.register(jwt, {
  secret: process.env.JWT_SECRET || 'supersecret'
});

// Health check
server.get('/', async (request, reply) => {
  return { status: 'ok', message: 'Caisse Backend API is running' };
});

// DB Check
server.get('/db-check', async (request, reply) => {
  try {
    const count = await prisma.user.count();
    return { status: 'ok', userCount: count };
  } catch (err) {
    server.log.error(err);
    return { status: 'error', message: 'Database connection failed' };
  }
});

// WiFi Security Status endpoint for mobile app
server.get('/config/wifi-security-status', async (request, reply) => {
  try {
    const config = await prisma.appConfig.findFirst({
      where: { key: 'wifi_security_enabled' }
    });
    
    return { 
      enabled: config?.value === 'true',
      message: config?.value === 'true' ? 'WiFi security is enabled' : 'WiFi security is disabled'
    };
  } catch (error) {
    server.log.error(error);
    // If config not found, default to disabled for development
    return { enabled: false, message: 'WiFi security is disabled (default)' };
  }
});

// Mobile Login endpoint
// Mobile login endpoint
server.post('/api/mobile/login', async (request, reply) => {
  try {
    const { email, password } = request.body as any;
    
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email et mot de passe requis' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return reply.code(401).send({ error: 'Email ou mot de passe incorrect' });
    }

    // DEV MODE: Compare plain text password (in production, use bcrypt)
    // Check password_hash field first (for mobile backend users)
    // If no password_hash, check Account table (for BetterAuth web users)
    let isValid = false;
    
    if (user.password_hash) {
      // Mobile backend user with plain password
      isValid = user.password_hash === password;
    } else {
      // Web user - need to check Account table (BetterAuth)
      const account = await prisma.account.findFirst({
        where: { 
          userId: user.id,
          providerId: 'credential'
        }
      });
      
      if (account?.password) {
        // BetterAuth uses bcrypt - need to import bcrypt for production
        // For now in dev, just reject web users from mobile login
        return reply.code(401).send({ 
          error: 'Utilisez l\'application web pour vous connecter avec ce compte' 
        });
      }
    }
    
    if (!isValid) {
      return reply.code(401).send({ error: 'Email ou mot de passe incorrect' });
    }
    
    // Check if user has valid role for mobile app
    const validRoles = ['AGENT_CONTROLE', 'AGENT_HYGIENE', 'SECURITE', 'ADMIN', 'DIRECTION'];
    if (!validRoles.includes(user.role)) {
      return reply.code(403).send({ 
        error: 'Accès refusé. Votre rôle ne permet pas l\'utilisation de l\'application mobile.' 
      });
    }

    // Generate JWT token
    const token = server.jwt.sign({ 
      id: user.id,
      email: user.email, 
      role: user.role 
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Auth Routes (Placeholder)
server.post('/auth/login', async (request, reply) => {
  // TODO: Implement actual login logic with bcrypt
  const { email, password } = request.body as any;
  
  // Mock login for now
  if (email === 'admin@test.com' && password === 'admin') {
    const token = server.jwt.sign({ email, role: 'ADMIN' });
    return { token };
  }
  
  return reply.code(401).send({ message: 'Invalid credentials' });
});

// ==================== TOUR MANAGEMENT ====================

// Get all tours (with filters)
server.get('/api/tours', async (request, reply) => {
  try {
    const { status, matricule } = request.query as any;
    
    const where: any = {};
    if (status) where.statut = status;
    if (matricule) where.matricule_vehicule = { contains: matricule };
    
    const tours = await prisma.tour.findMany({
      where,
      include: {
        driver: true,
        secteur: true,
        agentControle: { select: { email: true, name: true, role: true } },
        agentHygiene: { select: { email: true, name: true, role: true } },
        securiteSortie: { select: { email: true, name: true, role: true } },
        securiteEntree: { select: { email: true, name: true, role: true } },
        conflicts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return tours;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Get tour by ID
server.get('/api/tours/:id', async (request, reply) => {
  try {
    const { id } = request.params as any;
    
    const tour = await prisma.tour.findUnique({
      where: { id },
      include: {
        driver: true,
        secteur: true,
        agentControle: { select: { email: true, name: true, role: true } },
        agentHygiene: { select: { email: true, name: true, role: true } },
        securiteSortie: { select: { email: true, name: true, role: true } },
        securiteEntree: { select: { email: true, name: true, role: true } },
        lignesRetour: { include: { produit: true } },
        conflicts: true,
      },
    });
    
    if (!tour) {
      return reply.code(404).send({ error: 'Tournée non trouvée' });
    }
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Create new tour (Agent Contrôle)
server.post('/api/tours/create', async (request, reply) => {
  try {
    const {
      driverId,
      secteurId,
      agentControleId,
      matricule_vehicule,
      nbre_caisses_depart,
      poids_net_produits_depart,
      photo_preuve_depart_url,
    } = request.body as any;
    
    // Validation
    if (!driverId || !secteurId || !agentControleId || !matricule_vehicule || 
        !nbre_caisses_depart || !poids_net_produits_depart) {
      return reply.code(400).send({ error: 'Tous les champs sont requis' });
    }
    
    const tour = await prisma.tour.create({
      data: {
        driverId,
        secteurId,
        agentControleId,
        matricule_vehicule,
        nbre_caisses_depart,
        poids_net_produits_depart,
        photo_preuve_depart_url,
        statut: 'PREPARATION',
      },
      include: {
        driver: true,
        secteur: true,
        agentControle: true,
      },
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors de la création de la tournée' });
  }
});

// Update tour - Mark as ready (Agent Contrôle)
server.patch('/api/tours/:id/pret', async (request, reply) => {
  try {
    const { id } = request.params as any;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: { statut: 'PRET_A_PARTIR' },
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Pesée Sortie (Sécurité)
server.patch('/api/tours/:id/sortie', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const {
      securiteIdSortie,
      poids_brut_securite_sortie,
      matricule_verifie,
    } = request.body as any;
    
    if (!securiteIdSortie || !poids_brut_securite_sortie || matricule_verifie === undefined) {
      return reply.code(400).send({ error: 'Données manquantes' });
    }
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        securiteIdSortie,
        poids_brut_securite_sortie,
        matricule_verifie_sortie: matricule_verifie,
        date_sortie_securite: new Date(),
        statut: 'EN_TOURNEE',
      },
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors de la pesée sortie' });
  }
});

// Pesée Entrée (Sécurité)
server.patch('/api/tours/:id/entree', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const {
      securiteIdEntree,
      poids_brut_securite_retour,
      poids_tare_securite,
      matricule_verifie,
    } = request.body as any;
    
    if (!securiteIdEntree || !poids_brut_securite_retour || !poids_tare_securite || matricule_verifie === undefined) {
      return reply.code(400).send({ error: 'Données manquantes' });
    }
    
    const poids_net_total_calcule = poids_brut_securite_retour - poids_tare_securite;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        securiteIdEntree,
        poids_brut_securite_retour,
        poids_tare_securite,
        poids_net_total_calcule,
        matricule_verifie_retour: matricule_verifie,
        date_entree_securite: new Date(),
        statut: 'EN_ATTENTE_DECHARGEMENT',
      },
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors de la pesée entrée' });
  }
});

// Contrôle Retour (Agent Contrôle)
server.patch('/api/tours/:id/retour', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const {
      nbre_caisses_retour,
      photo_preuve_retour_url,
      has_chicken_products,
    } = request.body as any;
    
    if (nbre_caisses_retour === undefined || !photo_preuve_retour_url) {
      return reply.code(400).send({ error: 'Données manquantes' });
    }
    
    // Get tour to check for conflicts
    const tour = await prisma.tour.findUnique({
      where: { id },
      include: { driver: true },
    });
    
    if (!tour) {
      return reply.code(404).send({ error: 'Tournée non trouvée' });
    }
    
    const caisses_manquantes = tour.nbre_caisses_depart - nbre_caisses_retour;
    const has_conflict = caisses_manquantes > 0;
    
    // Determine next status based on chicken products presence
    // Only require hygiene check if chicken products are returned
    let newStatus = 'TERMINEE';
    if (has_chicken_products === true) {
      newStatus = 'EN_ATTENTE_HYGIENE';
    }
    
    // Update tour
    const updatedTour = await prisma.tour.update({
      where: { id },
      data: {
        nbre_caisses_retour,
        photo_preuve_retour_url,
        statut: newStatus as any,
      },
    });
    
    // Create conflict if caisses missing
    let conflict = null;
    if (has_conflict) {
      // Get caisse value from config (default 50 TND if not set)
      const caisseConfig = await prisma.caisseConfig.findFirst();
      const valeur_tnd = caisseConfig?.valeur_tnd || 50;
      const montant_dette = caisses_manquantes * valeur_tnd;
      
      // Check driver tolerance
      const tolerance = tour.driver.tolerance_caisses_mensuelle || 0;
      const depasse_tolerance = caisses_manquantes > tolerance;
      
      conflict = await prisma.conflict.create({
        data: {
          tourId: id,
          quantite_perdue: caisses_manquantes,
          montant_dette_tnd: montant_dette,
          depasse_tolerance,
          statut: 'EN_ATTENTE',
        },
      });
      
      // TODO: Send notification to Direction
    }
    
    return {
      tour: updatedTour,
      conflict,
      has_conflict,
      caisses_manquantes,
      next_status: newStatus,
      requires_hygiene: has_chicken_products === true,
    };
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors du contrôle retour' });
  }
});

// Contrôle Hygiène (Agent Hygiène)
server.patch('/api/tours/:id/hygiene', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const {
      agentHygieneId,
      photos_hygiene_urls,
      notes_hygiene,
      statut_hygiene, // APPROUVE or REJETE
      lignesRetour, // Array of products returned
    } = request.body as any;
    
    if (!agentHygieneId || !statut_hygiene) {
      return reply.code(400).send({ error: 'Données manquantes' });
    }
    
    // Always set to TERMINEE (approved or rejected)
    const newStatus = 'TERMINEE';
    
    // Update tour
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        agentHygieneId,
        photos_hygiene_urls: photos_hygiene_urls || [],
        notes_hygiene,
        statut_hygiene,
        statut: newStatus as any,
      },
    });
    
    // Create product return lines if provided
    if (lignesRetour && lignesRetour.length > 0) {
      await prisma.ligneRetourProduit.createMany({
        data: lignesRetour.map((ligne: any) => ({
          tourId: id,
          produitId: ligne.produitId,
          nbre_caisses: ligne.nbre_caisses,
          poids_brut_retour: ligne.poids_brut_retour,
          poids_net_retour: ligne.poids_net_retour,
          note_etat: ligne.note_etat,
        })),
      });
    }
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors du contrôle hygiène' });
  }
});

// ==================== CONFLICT MANAGEMENT ====================

// Get all conflicts
server.get('/api/conflicts', async (request, reply) => {
  try {
    const { status } = request.query as any;
    
    const where: any = {};
    if (status) where.statut = status;
    
    const conflicts = await prisma.conflict.findMany({
      where,
      include: {
        tour: {
          include: {
            driver: true,
            secteur: true,
            agentControle: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return conflicts;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Update conflict (Direction)
server.patch('/api/conflicts/:id', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const {
      notes_direction,
      direction_id_approbation,
      statut, // EN_ATTENTE, PAYEE, ANNULE
    } = request.body as any;
    
    const updateData: any = {};
    if (notes_direction !== undefined) updateData.notes_direction = notes_direction;
    if (direction_id_approbation) updateData.direction_id_approbation = direction_id_approbation;
    if (statut) {
      updateData.statut = statut;
      updateData.date_approbation_direction = new Date();
    }
    
    const conflict = await prisma.conflict.update({
      where: { id },
      data: updateData,
      include: {
        tour: {
          include: {
            driver: true,
          },
        },
      },
    });
    
    return conflict;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors de la mise à jour du conflit' });
  }
});

// ==================== HELPER ENDPOINTS ====================

// Get drivers
server.get('/api/drivers', async (request, reply) => {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: { nom_complet: 'asc' },
    });
    return drivers;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Get secteurs
server.get('/api/secteurs', async (request, reply) => {
  try {
    const secteurs = await prisma.secteur.findMany({
      orderBy: { nom: 'asc' },
    });
    return secteurs;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Get produits
server.get('/api/produits', async (request, reply) => {
  try {
    const produits = await prisma.produit.findMany({
      orderBy: { nom: 'asc' },
    });
    return produits;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Get next available matricule serie number
server.get('/api/matricules/next-serie', async (request, reply) => {
  try {
    // Get all tours and extract serie numbers (first 3 digits)
    const tours = await prisma.tour.findMany({
      select: { matricule_vehicule: true }
    });
    
    let maxSerie = 240; // Start from 240 (newest vehicles)
    
    for (const tour of tours) {
      const match = tour.matricule_vehicule.match(/^(\d{3})/);
      if (match) {
        const serie = parseInt(match[1]);
        if (serie > maxSerie) {
          maxSerie = serie;
        }
      }
    }
    
    // Return next available serie number
    const nextSerie = (maxSerie + 1).toString().padStart(3, '0');
    
    return {
      current_max: maxSerie,
      next_serie: nextSerie,
      formatted: `${nextSerie} تونس XXXX`
    };
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur serveur' });
  }
});

const start = async () => {
  try {
    await server.listen({ port: 3001, host: '0.0.0.0' });
    console.log('Server running at http://localhost:3001');
  console.log('API Endpoints:');
  console.log('  - GET  / (health check)');
  console.log('  - POST /auth/login');
  console.log('  - POST /api/mobile/login');
  console.log('  - GET  /config/wifi-security-status');
  console.log('  - GET  /api/tours');
  console.log('  - GET  /api/tours/:id');
  console.log('  - POST /api/tours/create');
  console.log('  - PATCH /api/tours/:id/sortie');
  console.log('  - PATCH /api/tours/:id/entree');
  console.log('  - PATCH /api/tours/:id/retour');
  console.log('  - PATCH /api/tours/:id/hygiene');
  console.log('  - POST /api/conflicts/create');
  console.log('  - GET  /api/conflicts');
  console.log('  - PATCH /api/conflicts/:id');
  console.log('  - GET  /drivers');
  console.log('  - GET  /config/ssids');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
