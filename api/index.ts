import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { UTApi } from 'uploadthing/server';

dotenv.config();

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize UploadThing
const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

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

// Dashboard KPIs endpoint
server.get('/api/dashboard/kpis', async (request, reply) => {
  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Count tours by status
    const [
      totalToursToday,
      toursEnCours,
      toursTermines,
      toursEnAttente,
      totalDrivers,
      totalConflicts,
      conflitsEnAttente
    ] = await Promise.all([
      // Total tours created today
      prisma.tour.count({
        where: {
          createdAt: { gte: today, lt: tomorrow }
        }
      }),
      // Tours currently in progress (EN_TOURNEE)
      prisma.tour.count({
        where: {
          statut: 'EN_TOURNEE',
          createdAt: { gte: today, lt: tomorrow }
        }
      }),
      // Completed tours today
      prisma.tour.count({
        where: {
          statut: 'TERMINEE',
          createdAt: { gte: today, lt: tomorrow }
        }
      }),
      // Tours waiting (PREPARATION, PRET_A_PARTIR, EN_ATTENTE_*)
      prisma.tour.count({
        where: {
          statut: { in: ['PREPARATION', 'PRET_A_PARTIR', 'EN_ATTENTE_DECHARGEMENT', 'EN_ATTENTE_HYGIENE'] },
          createdAt: { gte: today, lt: tomorrow }
        }
      }),
      // Total active drivers
      prisma.driver.count(),
      // Total conflicts
      prisma.conflict.count(),
      // Pending conflicts
      prisma.conflict.count({
        where: { statut: 'EN_ATTENTE' }
      })
    ]);

    // Calculate total crates today
    const caissesToday = await prisma.tour.aggregate({
      where: {
        createdAt: { gte: today, lt: tomorrow }
      },
      _sum: {
        nbre_caisses_depart: true,
        nbre_caisses_retour: true
      }
    });

    return {
      toursAujourdHui: totalToursToday,
      toursEnCours,
      toursTermines,
      toursEnAttente,
      totalChauffeurs: totalDrivers,
      caissesDepart: caissesToday._sum.nbre_caisses_depart || 0,
      caissesRetour: caissesToday._sum.nbre_caisses_retour || 0,
      conflitsTotal: totalConflicts,
      conflitsEnAttente,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors du chargement des KPIs' });
  }
});

// Dashboard urgent conflicts endpoint
server.get('/api/dashboard/conflicts-urgent', async (request, reply) => {
  try {
    // Get pending conflicts that need attention
    const urgentConflicts = await prisma.conflict.findMany({
      where: { 
        statut: 'EN_ATTENTE'
      },
      include: {
        tour: {
          include: {
            driver: true,
            secteur: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Format for mobile app
    const formattedConflicts = urgentConflicts.map(conflict => ({
      id: conflict.id,
      tourId: conflict.tour_id,
      driver: conflict.tour?.driver?.nom || 'Chauffeur inconnu',
      secteur: conflict.tour?.secteur?.nom || 'Secteur inconnu',
      matricule: conflict.tour?.matricule_vehicule || '',
      quantite_perdue: conflict.quantite_perdue || 0,
      montant_dette_tnd: conflict.montant_dette_tnd || 0,
      depasse_tolerance: conflict.depasse_tolerance || false,
      is_surplus: conflict.is_surplus || false,
      createdAt: conflict.createdAt.toISOString(),
    }));

    return formattedConflicts;
  } catch (error: any) {
    console.error('Error loading urgent conflicts:', error.message);
    return reply.code(500).send({ error: 'Erreur lors du chargement des conflits urgents' });
  }
});

// Dashboard active tours endpoint
server.get('/api/dashboard/tours-active', async (request, reply) => {
  try {
    // Get today's tours that are still active
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const activeTours = await prisma.tour.findMany({
      where: {
        createdAt: { gte: todayStart },
        statut: { in: ['PREPARATION', 'PRET_A_PARTIR', 'EN_TOURNEE', 'EN_ATTENTE_DECHARGEMENT', 'EN_ATTENTE_HYGIENE'] }
      },
      include: {
        driver: true,
        secteur: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Format for mobile app
    const formattedTours = activeTours.map(tour => ({
      id: tour.id,
      driver: tour.driver?.nom || 'Chauffeur inconnu',
      secteur: tour.secteur?.nom || 'Secteur inconnu',
      matricule: tour.matricule_vehicule || '',
      statut: tour.statut,
      caisses_depart: tour.nbre_caisses_depart || 0,
      caisses_retour: tour.nbre_caisses_retour,
      date_sortie: tour.date_sortie?.toISOString() || null,
      date_entree: tour.date_entree?.toISOString() || null,
      createdAt: tour.createdAt.toISOString(),
    }));

    return formattedTours;
  } catch (error: any) {
    console.error('Error loading active tours:', error.message);
    return reply.code(500).send({ error: 'Erreur lors du chargement des tours actifs' });
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

    console.log('Tour create request:', { secteurId, agentControleId, matricule_vehicule, nbre_caisses_depart, driverId, driverName });

    // Validate required fields
    if (!secteurId || !agentControleId || !matricule_vehicule || !nbre_caisses_depart) {
      console.log('Missing required fields:', { secteurId, agentControleId, matricule_vehicule, nbre_caisses_depart });
      return reply.code(400).send({ error: 'Champs requis manquants', details: { secteurId, agentControleId, matricule_vehicule, nbre_caisses_depart } });
    }

    // If driverId is provided, use existing driver
    let finalDriverId = driverId;

    // If no driverId but driverName provided, create new driver
    if (!finalDriverId && driverName) {
      console.log('Creating new driver:', driverName);
      const newDriver = await prisma.driver.create({
        data: {
          nom_complet: driverName,
          matricule_par_defaut: matricule_vehicule,
        }
      });
      finalDriverId = newDriver.id;
      console.log('New driver created:', finalDriverId);
    }

    if (!finalDriverId) {
      console.log('No driver ID available');
      return reply.code(400).send({ error: 'Driver information required' });
    }

    // Upload photo to UploadThing if provided
    let photoUrl: string | null = null;
    if (photo_base64) {
      try {
        console.log('Uploading photo to UploadThing...');
        // Extract base64 data from data URL
        const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Create a File-like object for UploadThing
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const file = new File([blob], `tour_depart_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        // Upload using UploadThing API
        const uploadResult = await utapi.uploadFiles([file]);
        
        if (uploadResult[0]?.data?.ufsUrl) {
          photoUrl = uploadResult[0].data.ufsUrl;
          console.log('Photo uploaded successfully:', photoUrl);
        } else if (uploadResult[0]?.data?.url) {
          photoUrl = uploadResult[0].data.url;
          console.log('Photo uploaded successfully (alt):', photoUrl);
        } else {
          console.warn('Upload succeeded but no URL returned:', uploadResult);
        }
      } catch (uploadError: any) {
        console.error('Photo upload failed:', uploadError.message);
        // Continue without photo if upload fails
      }
    }

    // Create tour
    console.log('Creating tour with driverId:', finalDriverId);
    const tour = await prisma.tour.create({
      data: {
        secteurId,
        matricule_vehicule,
        nbre_caisses_depart: parseInt(nbre_caisses_depart),
        poids_net_produits_depart: parseFloat(poids_net_produits_depart) || 0,
        photo_preuve_depart_url: photoUrl,
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

    console.log('Tour created successfully:', tour.id);
    return tour;
  } catch (error: any) {
    console.error('Error creating tour:', error.message, error.code);
    server.log.error('Error creating tour:', error);
    return reply.code(500).send({ error: 'Erreur lors de la création de la tournée', details: error.message });
  }
});

// Mark tour as ready to depart
server.patch('/api/tours/:id/pret', async (request, reply) => {
  try {
    const { id } = request.params as any;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        statut: 'PRET_A_PARTIR',
      },
      include: {
        driver: true,
        secteur: true,
      }
    });
    
    return tour;
  } catch (error: any) {
    console.error('Error marking tour ready:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de la mise à jour', details: error.message });
  }
});

// Update tour status (generic)
server.patch('/api/tours/:id/status', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const { status } = request.body as any;
    
    if (!status) {
      return reply.code(400).send({ error: 'Status is required' });
    }
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        statut: status,
      },
      include: {
        driver: true,
        secteur: true,
      }
    });
    
    return tour;
  } catch (error: any) {
    console.error('Error updating tour status:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de la mise à jour', details: error.message });
  }
});

// Security exit weighing (sortie)
server.patch('/api/tours/:id/sortie', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const { poids_brut_securite_sortie, matricule_vehicule } = request.body as any;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        poids_brut_securite_sortie: parseFloat(poids_brut_securite_sortie),
        matricule_verifie_sortie: true,
        date_sortie_securite: new Date(),
        statut: 'EN_TOURNEE',
      },
      include: {
        driver: true,
        secteur: true,
      }
    });
    
    return tour;
  } catch (error: any) {
    console.error('Error processing sortie:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de la pesée sortie', details: error.message });
  }
});

// Security authorize exit (without weighing)
server.patch('/api/tours/:id/exit', async (request, reply) => {
  try {
    const { id } = request.params as any;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        date_sortie_finale: new Date(),
      },
      include: {
        driver: true,
        secteur: true,
      }
    });
    
    return tour;
  } catch (error: any) {
    console.error('Error authorizing exit:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de l\'autorisation de sortie', details: error.message });
  }
});

// Security entry weighing (entree/retour)
server.patch('/api/tours/:id/entree', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const { poids_brut_securite_entree, matricule_vehicule } = request.body as any;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        poids_brut_securite_retour: parseFloat(poids_brut_securite_entree),
        matricule_verifie_retour: true,
        date_entree_securite: new Date(),
        statut: 'EN_ATTENTE_DECHARGEMENT',
      },
      include: {
        driver: true,
        secteur: true,
      }
    });
    
    return tour;
  } catch (error: any) {
    console.error('Error processing entree:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de la pesée entrée', details: error.message });
  }
});

// Agent controle retour (crate count and photo)
server.patch('/api/tours/:id/retour', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const { 
      nbre_caisses_retour, 
      has_chicken_products, 
      photo_preuve_retour_base64, 
      photo_preuve_retour_url 
    } = request.body as any;
    
    // Upload photo if base64 provided
    let photoUrl = photo_preuve_retour_url || null;
    if (photo_preuve_retour_base64) {
      try {
        const base64Data = photo_preuve_retour_base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const file = new File([blob], `tour_retour_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        const uploadResult = await utapi.uploadFiles([file]);
        photoUrl = uploadResult[0]?.data?.ufsUrl || uploadResult[0]?.data?.url || null;
      } catch (uploadError: any) {
        console.warn('Photo upload failed:', uploadError.message);
      }
    }
    
    // Determine next status based on chicken products
    const nextStatus = has_chicken_products ? 'EN_ATTENTE_HYGIENE' : 'TERMINEE';
    
    // Get existing tour to calculate conflicts
    const existingTour = await prisma.tour.findUnique({
      where: { id },
      include: { driver: true }
    });
    
    if (!existingTour) {
      return reply.code(404).send({ error: 'Tournée non trouvée' });
    }
    
    const difference = existingTour.nbre_caisses_depart - parseInt(nbre_caisses_retour);
    const tolerance = existingTour.driver?.tolerance_caisses_mensuelle || 0;
    
    // Create conflict if crate difference exceeds tolerance
    if (difference > tolerance) {
      await prisma.conflict.create({
        data: {
          tourId: id,
          quantite_perdue: difference,
          montant_dette_tnd: difference * 50, // Example: 50 TND per crate
          depasse_tolerance: true,
          statut: 'EN_ATTENTE',
        }
      });
    }
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        nbre_caisses_retour: parseInt(nbre_caisses_retour),
        photo_preuve_retour_url: photoUrl,
        statut: nextStatus,
      },
      include: {
        driver: true,
        secteur: true,
        conflicts: true,
      }
    });
    
    return tour;
  } catch (error: any) {
    console.error('Error processing retour:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de l\'enregistrement du retour', details: error.message });
  }
});

// Agent hygiene validation
server.patch('/api/tours/:id/hygiene', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const { agentHygieneId, photos_hygiene_urls, notes_hygiene, statut_hygiene } = request.body as any;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        agentHygieneId,
        photos_hygiene_urls: photos_hygiene_urls || [],
        notes_hygiene,
        statut_hygiene,
        statut: 'TERMINEE',
      },
      include: {
        driver: true,
        secteur: true,
        agentHygiene: true,
      }
    });
    
    return tour;
  } catch (error: any) {
    console.error('Error processing hygiene:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de la validation hygiène', details: error.message });
  }
});

// Get conflicts list
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
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return conflicts;
  } catch (error: any) {
    console.error('Error loading conflicts:', error.message);
    return reply.code(500).send({ error: 'Erreur lors du chargement des conflits' });
  }
});

// Get conflict by ID
server.get('/api/conflicts/:id', async (request, reply) => {
  try {
    const { id } = request.params as any;
    
    const conflict = await prisma.conflict.findUnique({
      where: { id },
      include: {
        tour: {
          include: {
            driver: true,
            secteur: true,
            agentControle: true,
          }
        }
      }
    });
    
    if (!conflict) {
      return reply.code(404).send({ error: 'Conflit non trouvé' });
    }
    
    return conflict;
  } catch (error: any) {
    console.error('Error loading conflict:', error.message);
    return reply.code(500).send({ error: 'Erreur lors du chargement du conflit' });
  }
});

// Approve conflict (Direction)
server.post('/api/conflicts/:id/approve', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const { notes } = request.body as any;
    
    const conflict = await prisma.conflict.update({
      where: { id },
      data: {
        statut: 'PAYEE',
        notes_direction: notes || '',
        date_approbation_direction: new Date(),
      },
      include: {
        tour: {
          include: {
            driver: true,
          }
        }
      }
    });
    
    return conflict;
  } catch (error: any) {
    console.error('Error approving conflict:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de l\'approbation du conflit', details: error.message });
  }
});

// Reject conflict (Direction)
server.post('/api/conflicts/:id/reject', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const { notes } = request.body as any;
    
    if (!notes || !notes.trim()) {
      return reply.code(400).send({ error: 'Une raison est obligatoire pour rejeter' });
    }
    
    const conflict = await prisma.conflict.update({
      where: { id },
      data: {
        statut: 'ANNULE',
        notes_direction: notes,
        date_approbation_direction: new Date(),
      },
      include: {
        tour: {
          include: {
            driver: true,
          }
        }
      }
    });
    
    return conflict;
  } catch (error: any) {
    console.error('Error rejecting conflict:', error.message);
    return reply.code(500).send({ error: 'Erreur lors du rejet du conflit', details: error.message });
  }
});

// Register push notification token
server.post('/api/notifications/register-token', async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Token requis' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = server.jwt.verify(token);
    } catch (e) {
      return reply.code(401).send({ error: 'Token invalide' });
    }

    const { expoPushToken } = request.body as any;
    
    if (!expoPushToken) {
      return reply.code(400).send({ error: 'Expo push token requis' });
    }

    // Update user with push token
    await prisma.user.update({
      where: { id: decoded.id },
      data: { expoPushToken }
    });

    console.log(`[Notifications] Registered token for user ${decoded.email}: ${expoPushToken}`);
    return { success: true, message: 'Token enregistré' };
  } catch (error: any) {
    console.error('Error registering push token:', error.message);
    return reply.code(500).send({ error: 'Erreur lors de l\'enregistrement du token' });
  }
});

// Get user notifications
server.get('/api/notifications', async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Token requis' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = server.jwt.verify(token);
    } catch (e) {
      return reply.code(401).send({ error: 'Token invalide' });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: decoded.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return notifications;
  } catch (error: any) {
    console.error('Error loading notifications:', error.message);
    return reply.code(500).send({ error: 'Erreur lors du chargement des notifications' });
  }
});

// Mark notification as read
server.patch('/api/notifications/:id/read', async (request, reply) => {
  try {
    const { id } = request.params as any;

    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    return notification;
  } catch (error: any) {
    console.error('Error marking notification read:', error.message);
    return reply.code(500).send({ error: 'Erreur' });
  }
});

// Export for Vercel
export default async function handler(req: any, res: any) {
  await server.ready();
  server.server.emit('request', req, res);
}

