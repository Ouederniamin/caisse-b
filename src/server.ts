import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import prisma from './lib/prisma';
import { notificationService } from './services/notificationService';
import path from 'path';
import fs from 'fs';

dotenv.config();

const server = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024, // 50MB for base64 images
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Register plugins
server.register(cors, {
  origin: true // Allow all origins for dev, restrict in prod
});

server.register(jwt, {
  secret: process.env.JWT_SECRET || 'supersecret'
});

// Serve static files from uploads directory
server.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
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
    // First check environment variable (takes priority)
    const envWifiSecurity = process.env.WIFI_SECURITY_ENABLED;
    if (envWifiSecurity !== undefined) {
      const enabled = envWifiSecurity.toLowerCase() === 'true';
      return { 
        enabled,
        message: enabled ? 'WiFi security is enabled' : 'WiFi security is disabled',
        source: 'environment'
      };
    }
    
    // Fallback to database config
    const config = await prisma.appConfig.findFirst({
      where: { key: 'wifi_security_enabled' }
    });
    
    const enabled = config?.value === 'true';
    return { 
      enabled,
      message: enabled ? 'WiFi security is enabled' : 'WiFi security is disabled',
      source: 'database'
    };
  } catch (error) {
    server.log.error(error);
    // Default to disabled if any error
    return { enabled: false, message: 'WiFi security is disabled (default)', source: 'default' };
  }
});

// Mobile Login endpoint - calls web BetterAuth for password verification
server.post('/api/mobile/login', async (request, reply) => {
  try {
    const { email, password } = request.body as any;
    
    console.log('[Mobile Login] Attempt for:', email);
    
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email et mot de passe requis' });
    }

    // Call the web app's BetterAuth endpoint to verify credentials
    const webAuthUrl = process.env.WEB_AUTH_URL || 'http://localhost:3000';
    
    try {
      const signInResponse = await fetch(`${webAuthUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      if (!signInResponse.ok) {
        console.log('[Mobile Login] Web BetterAuth signIn failed:', signInResponse.status);
        return reply.code(401).send({ error: 'Email ou mot de passe incorrect' });
      }
      
      console.log('[Mobile Login] Web BetterAuth signIn success');
    } catch (fetchError) {
      console.error('[Mobile Login] Failed to reach web auth:', fetchError);
      return reply.code(503).send({ error: 'Service d\'authentification non disponible' });
    }

    // Get user from database for JWT
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return reply.code(401).send({ error: 'Utilisateur non trouvé' });
    }

    console.log('[Mobile Login] Success for:', email, 'role:', user.role);
    
    // Check if user has valid role for mobile app
    const validRoles = ['AGENT_CONTROLE', 'AGENT_HYGIENE', 'SECURITE', 'ADMIN', 'DIRECTION'];
    if (!validRoles.includes(user.role)) {
      return reply.code(403).send({ 
        error: 'Accès refusé. Votre rôle ne permet pas l\'utilisation de l\'application mobile.' 
      });
    }

    // Generate JWT token for mobile app
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

// Find driver by matricule
server.get('/api/drivers/by-matricule', async (request, reply) => {
  try {
    const { matricule } = request.query as any;
    
    if (!matricule) {
      return reply.code(400).send({ error: 'Matricule requis' });
    }
    
    // Find driver that has this matricule as default
    const driver = await prisma.driver.findFirst({
      where: { matricule_par_defaut: matricule },
    });
    
    if (driver) {
      return { driver };
    }
    
    // If not found by default matricule, check in recent tours
    const recentTour = await prisma.tour.findFirst({
      where: { matricule_vehicule: matricule },
      orderBy: { createdAt: 'desc' },
      include: { driver: true },
    });
    
    if (recentTour?.driver) {
      return { driver: recentTour.driver };
    }
    
    return { driver: null };
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
      photo_base64,
      driverName,
      marque_vehicule,
    } = request.body as any;
    
    // Validation
    if (!secteurId || !agentControleId || !matricule_vehicule || !nbre_caisses_depart) {
      return reply.code(400).send({ error: 'Secteur, agent, matricule et nombre de caisses sont requis' });
    }
    
    // Handle driver - create new if not exists
    let finalDriverId = driverId;
    if (!driverId && driverName) {
      // Create new driver
      const newDriver = await prisma.driver.create({
        data: {
          nom_complet: driverName,
          matricule_par_defaut: matricule_vehicule,
          marque_vehicule: marque_vehicule || null,
        },
      });
      finalDriverId = newDriver.id;
    }
    
    // Handle photo upload - save base64 as data URL or file
    let photoUrl = photo_preuve_depart_url;
    if (photo_base64) {
      // Save base64 image to file system
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      
      // Create uploads directory if it doesn't exist
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Generate unique filename
      const filename = `tour_depart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
      const filePath = path.join(uploadsDir, filename);
      
      // Remove data URL prefix if present
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
      
      // Write file
      fs.writeFileSync(filePath, base64Data, 'base64');
      
      // Set URL for serving
      photoUrl = `/uploads/${filename}`;
    }
    
    const tour = await prisma.tour.create({
      data: {
        driverId: finalDriverId || null,
        secteurId,
        agentControleId,
        matricule_vehicule,
        nbre_caisses_depart: parseInt(nbre_caisses_depart),
        poids_net_produits_depart: poids_net_produits_depart || 0,
        photo_preuve_depart_url: photoUrl,
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
    const body = request.body as any;
    
    // Support both formats: from web (securiteIdSortie) and mobile (userId from token)
    const user = (request as any).user;
    const securiteIdSortie = body.securiteIdSortie || user?.id;
    const poids_brut_securite_sortie = body.poids_brut_securite_sortie;
    const matricule_verifie = body.matricule_verifie !== undefined ? body.matricule_verifie : true;
    const matricule_vehicule = body.matricule_vehicule;
    
    if (!poids_brut_securite_sortie) {
      return reply.code(400).send({ error: 'Poids brut requis' });
    }
    
    const updateData: any = {
      poids_brut_securite_sortie,
      matricule_verifie_sortie: matricule_verifie,
      date_sortie_securite: new Date(),
      statut: 'EN_TOURNEE', // After pesée sortie, the vehicle is on its route
    };
    
    if (securiteIdSortie) {
      updateData.securiteIdSortie = securiteIdSortie;
    }
    
    if (matricule_vehicule) {
      updateData.matricule_vehicule = matricule_vehicule;
    }
    
    const tour = await prisma.tour.update({
      where: { id },
      data: updateData,
      include: {
        driver: true,
        secteur: true,
      },
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors de la pesée sortie' });
  }
});

// Pesée Entrée / Autoriser Départ (Sécurité) - Final weighing when driver leaves
server.patch('/api/tours/:id/entree', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const body = request.body as any;
    
    // Support both formats: from web and mobile
    const user = (request as any).user;
    const securiteIdEntree = body.securiteIdEntree || user?.id;
    const poids_brut_securite_retour = body.poids_brut_securite_retour || body.poids_brut_securite_entree;
    const poids_tare_securite = body.poids_tare_securite;
    const matricule_verifie = body.matricule_verifie !== undefined ? body.matricule_verifie : true;
    const matricule_vehicule = body.matricule_vehicule;
    
    if (!poids_brut_securite_retour) {
      return reply.code(400).send({ error: 'Poids brut requis' });
    }
    
    // Vehicle returned from delivery - now goes to déchargement (unloading)
    const updateData: any = {
      poids_brut_securite_retour,
      matricule_verifie_retour: matricule_verifie,
      date_entree_securite: new Date(), // Entry time when vehicle returns
      statut: 'EN_ATTENTE_DECHARGEMENT', // Move to unloading phase
    };
    
    if (securiteIdEntree) {
      updateData.securiteIdEntree = securiteIdEntree;
    }
    
    if (poids_tare_securite) {
      updateData.poids_tare_securite = poids_tare_securite;
      updateData.poids_net_total_calcule = poids_brut_securite_retour - poids_tare_securite;
    }
    
    if (matricule_vehicule) {
      updateData.matricule_vehicule = matricule_vehicule;
    }
    
    const tour = await prisma.tour.update({
      where: { id },
      data: updateData,
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors de la pesée entrée' });
  }
});

// Signal vehicle arrival back at site (changes from EN_TOURNEE to EN_ATTENTE_DECHARGEMENT)
server.patch('/api/tours/:id/arrivee', async (request, reply) => {
  try {
    const { id } = request.params as any;
    
    const tour = await prisma.tour.update({
      where: { id },
      data: {
        statut: 'EN_ATTENTE_DECHARGEMENT',
      },
      include: {
        driver: true,
        secteur: true,
      },
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors du signalement d\'arrivée' });
  }
});

// Log vehicle final exit (Sécurité authorizes vehicle to leave after TERMINEE)
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
      },
    });
    
    return tour;
  } catch (error) {
    server.log.error(error);
    return reply.code(500).send({ error: 'Erreur lors de l\'autorisation de sortie' });
  }
});

// Contrôle Retour (Agent Contrôle)
server.patch('/api/tours/:id/retour', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const {
      nbre_caisses_retour,
      photo_preuve_retour_url,
      photo_preuve_retour_base64,
      has_chicken_products,
    } = request.body as any;
    
    if (nbre_caisses_retour === undefined) {
      return reply.code(400).send({ error: 'Nombre de caisses requis' });
    }
    
    // Handle photo - either from URL or base64
    let finalPhotoUrl = photo_preuve_retour_url;
    
    if (photo_preuve_retour_base64 && !photo_preuve_retour_url) {
      // Save base64 image to file
      const fileName = `retour_${id}_${Date.now()}.jpg`;
      const filePath = path.join(__dirname, '..', 'uploads', fileName);
      
      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Write base64 to file
      const imageBuffer = Buffer.from(photo_preuve_retour_base64, 'base64');
      fs.writeFileSync(filePath, imageBuffer);
      
      finalPhotoUrl = `/uploads/${fileName}`;
    }
    
    if (!finalPhotoUrl) {
      return reply.code(400).send({ error: 'Photo de preuve requise' });
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
        photo_preuve_retour_url: finalPhotoUrl,
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
      const tolerance = tour.driver?.tolerance_caisses_mensuelle || 0;
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
      
      // Send notification to Direction about the conflict
      try {
        await notificationService.notifyNewConflict({
          conflictId: conflict.id,
          tourId: id,
          driverName: tour.driver?.nom_complet || 'Chauffeur inconnu',
          quantitePerdue: caisses_manquantes,
          depasseTolerance: depasse_tolerance,
          isSurplus: caisses_manquantes < 0, // negative means surplus
        });
      } catch (notifError: unknown) {
        server.log.error('Failed to send conflict notification: ' + String(notifError));
      }
    }
    
    // Notify Agent Hygiène if chicken products returned
    if (has_chicken_products === true) {
      try {
        await notificationService.notifyHygieneRequired(
          id,
          tour.driver?.nom_complet || 'Chauffeur inconnu',
          tour.matricule_vehicule || ''
        );
      } catch (notifError: unknown) {
        server.log.error('Failed to send hygiene notification: ' + String(notifError));
      }
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
    // Check for UploadThing token
    if (!process.env.UPLOADTHING_TOKEN) {
      console.warn('⚠️  UPLOADTHING_TOKEN not set - photo uploads may not work');
    }
    
    // Register upload routes (legacy - for backward compatibility)
    const uploadRoutes = await import('./routes/upload');
    await server.register(uploadRoutes.default);
    
    // Register UploadThing routes
    const uploadthingRoutes = await import('./routes/uploadthing');
    await server.register(uploadthingRoutes.default);
    
    // Register dashboard routes
    const dashboardRoutes = await import('./routes/dashboard');
    await server.register(dashboardRoutes.default);
    
    // Register notification routes
    const notificationRoutes = await import('./routes/notifications');
    await server.register(notificationRoutes.default);
    
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
  console.log('  - GET/POST /api/uploadthing (photo upload)');
  console.log('  - GET  /api/dashboard/kpis');
  console.log('  - GET  /api/dashboard/conflicts-urgent');
  console.log('  - GET  /api/dashboard/tours-active');
  console.log('  - GET  /api/finance/summary');
  console.log('  - GET/POST /api/notifications');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
