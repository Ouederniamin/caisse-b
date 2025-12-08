import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

// Initialize Prisma
const prisma = new PrismaClient();

const server = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024,
});

// Register plugins
server.register(cors, {
  origin: true
});

server.register(jwt, {
  secret: process.env.JWT_SECRET || 'supersecret'
});

// Health check
server.get('/', async (request, reply) => {
  return { status: 'ok', message: 'Caisse Backend API is running on Vercel' };
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

// WiFi Security Status endpoint
server.get('/config/wifi-security-status', async (request, reply) => {
  const envWifiSecurity = process.env.WIFI_SECURITY_ENABLED;
  if (envWifiSecurity !== undefined) {
    const enabled = envWifiSecurity.toLowerCase() === 'true';
    return { 
      enabled,
      message: enabled ? 'WiFi security is enabled' : 'WiFi security is disabled',
      source: 'environment'
    };
  }
  return { enabled: false, message: 'WiFi security is disabled (default)', source: 'default' };
});

// Mobile Login endpoint
server.post('/api/mobile/login', async (request, reply) => {
  try {
    const { email, password } = request.body as any;
    
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email et mot de passe requis' });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return reply.code(401).send({ error: 'Utilisateur non trouvé' });
    }

    // For now, verify password against account table or simple check
    const account = await prisma.account.findFirst({
      where: { userId: user.id }
    });

    // Simple password check (in production, use proper hashing)
    if (account?.password !== password && user.password_hash !== password) {
      // Try calling web auth
      const webAuthUrl = process.env.WEB_AUTH_URL || 'https://caisse-w.vercel.app';
      try {
        const signInResponse = await fetch(`${webAuthUrl}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        
        if (!signInResponse.ok) {
          return reply.code(401).send({ error: 'Email ou mot de passe incorrect' });
        }
      } catch (fetchError) {
        console.error('Web auth failed:', fetchError);
        return reply.code(401).send({ error: 'Email ou mot de passe incorrect' });
      }
    }

    // Check valid roles
    const validRoles = ['AGENT_CONTROLE', 'AGENT_HYGIENE', 'SECURITE', 'ADMIN', 'DIRECTION'];
    if (!validRoles.includes(user.role)) {
      return reply.code(403).send({ error: 'Accès refusé' });
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

// Get all tours
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

// Get drivers
server.get('/drivers', async (request, reply) => {
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

// Get drivers (with /api prefix for consistency)
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

// Get next serie number for matricules
server.get('/api/matricules/next-serie', async (request, reply) => {
  try {
    // Get the latest tour to determine next serie
    const latestTour = await prisma.tour.findFirst({
      where: {
        matricule_vehicule: {
          not: null
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    let nextSerie = '253'; // Default starting serie
    
    if (latestTour?.matricule_vehicule) {
      // Extract serie from matricule format: "123 تونس 4567"
      const parts = latestTour.matricule_vehicule.split(' ');
      if (parts.length >= 1) {
        const currentSerie = parts[0];
        const serieNum = parseInt(currentSerie, 10);
        if (!isNaN(serieNum)) {
          nextSerie = (serieNum + 1).toString().padStart(3, '0');
        }
      }
    }

    return { next_serie: nextSerie };
  } catch (error) {
    server.log.error('Error in next-serie:', error);
    // Return default serie on error
    return { next_serie: '253' };
  }
});

// Create tour (mobile app)
server.post('/api/tours/create', async (request, reply) => {
  try {
    const {
      secteurId,
      agentControleId,
      matricule_vehicule,
      nbre_caisses_depart,
      poids_net_produits_depart,
      photo_base64,
      driverId,
      driverName,
      marque_vehicule,
    } = request.body as any;

    // Validate required fields
    if (!secteurId || !agentControleId || !matricule_vehicule || !nbre_caisses_depart) {
      return reply.code(400).send({ error: 'Champs requis manquants' });
    }

    // If driverId is provided, use existing driver
    let finalDriverId = driverId;

    // If no driverId but driverName provided, create new driver
    if (!finalDriverId && driverName) {
      const newDriver = await prisma.driver.create({
        data: {
          nom_complet: driverName,
          matricule_par_defaut: matricule_vehicule,
          marque_vehicule: marque_vehicule || null,
        }
      });
      finalDriverId = newDriver.id;
    }

    if (!finalDriverId) {
      return reply.code(400).send({ error: 'Driver information required' });
    }

    // Create tour
    const tour = await prisma.tour.create({
      data: {
        secteurId,
        matricule_vehicule,
        nbre_caisses_depart: parseInt(nbre_caisses_depart),
        poids_net_produits_depart: parseFloat(poids_net_produits_depart) || 0,
        photo_depart_base64: photo_base64,
        statut: 'PREPARATION',
        agentControleId,
        driverId: finalDriverId,
      },
      include: {
        driver: true,
        secteur: true,
        agentControle: true,
      }
    });

    return tour;
  } catch (error) {
    server.log.error('Error creating tour:', error);
    return reply.code(500).send({ error: 'Erreur lors de la création de la tournée' });
  }
});

// Export for Vercel
export default async function handler(req: any, res: any) {
  await server.ready();
  server.server.emit('request', req, res);
}

