import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

export default async function dashboardRoutes(fastify: FastifyInstance) {

  // GET /api/dashboard/kpis - Main KPIs for Direction
  fastify.get('/api/dashboard/kpis', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get active tours (not TERMINEE)
      const toursActives = await prisma.tour.count({
        where: {
          statut: { not: 'TERMINEE' }
        }
      });

      // Get tours by status
      const toursByStatus = await prisma.tour.groupBy({
        by: ['statut'],
        _count: { id: true }
      });

      // Calculate caisses dehors (departed - returned for active tours)
      const activeTours = await prisma.tour.findMany({
        where: {
          statut: { not: 'TERMINEE' }
        },
        select: {
          nbre_caisses_depart: true,
          nbre_caisses_retour: true
        }
      });

      let caissesDehors = 0;
      activeTours.forEach(tour => {
        caissesDehors += tour.nbre_caisses_depart - (tour.nbre_caisses_retour || 0);
      });

      // Get open conflicts
      const conflitsOuverts = await prisma.conflict.count({
        where: { statut: 'EN_ATTENTE' }
      });

      // Get conflicts exceeding tolerance
      const conflitsHorsTolerance = await prisma.conflict.count({
        where: {
          statut: 'EN_ATTENTE',
          depasse_tolerance: true
        }
      });

      // Calculate kilos delivered today
      const toursToday = await prisma.tour.findMany({
        where: {
          statut: 'TERMINEE',
          updatedAt: { gte: today }
        },
        select: {
          poids_net_total_calcule: true,
          poids_net_produits_depart: true
        }
      });

      let kilosLivres = 0;
      toursToday.forEach(tour => {
        // Kilos delivered = depart - (net retour if exists)
        const kilosRetour = tour.poids_net_total_calcule || 0;
        kilosLivres += tour.poids_net_produits_depart - kilosRetour;
      });

      // Tours waiting for return/hygiene
      const toursEnAttenteRetour = await prisma.tour.count({
        where: { statut: 'EN_ATTENTE_DECHARGEMENT' }
      });

      const toursEnAttenteHygiene = await prisma.tour.count({
        where: { statut: 'EN_ATTENTE_HYGIENE' }
      });

      // Tours completed today
      const toursTermineesAujourdhui = await prisma.tour.count({
        where: {
          statut: 'TERMINEE',
          updatedAt: { gte: today }
        }
      });

      // Build status map for UI
      const statusMap: Record<string, number> = {};
      toursByStatus.forEach(item => {
        statusMap[item.statut] = item._count.id;
      });

      // Get stock data
      let stockData = {
        stock_actuel: 0,
        stock_initial: 0,
        stock_alerte: false,
        stock_configure: false
      };
      
      try {
        const stock = await prisma.stockCaisse.findFirst({
          orderBy: { updatedAt: 'desc' }
        });
        
        if (stock && stock.initialise) {
          const seuilAlerte = Math.floor(stock.stock_initial * (stock.seuil_alerte_pct / 100));
          stockData = {
            stock_actuel: stock.stock_actuel,
            stock_initial: stock.stock_initial,
            stock_alerte: stock.stock_actuel <= seuilAlerte,
            stock_configure: true
          };
        }
      } catch (stockError) {
        // Stock table might not exist yet
        console.log('Stock not configured yet');
      }

      return {
        tours_actives: toursActives,
        caisses_dehors: caissesDehors,
        conflits_ouverts: conflitsOuverts,
        conflits_hors_tolerance: conflitsHorsTolerance,
        kilos_livres: Math.round(kilosLivres * 100) / 100,
        tours_en_attente_retour: toursEnAttenteRetour,
        tours_en_attente_hygiene: toursEnAttenteHygiene,
        tours_terminees_aujourdhui: toursTermineesAujourdhui,
        tours_par_statut: statusMap,
        ...stockData,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/dashboard/conflicts-urgent - Urgent conflicts for Direction
  fastify.get('/api/dashboard/conflicts-urgent', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const conflicts = await prisma.conflict.findMany({
        where: { statut: 'EN_ATTENTE' },
        include: {
          tour: {
            include: {
              driver: true,
              secteur: true
            }
          }
        },
        orderBy: [
          { depasse_tolerance: 'desc' }, // Tolerance exceeded first
          { quantite_perdue: 'desc' },   // Then by quantity lost
          { createdAt: 'asc' }           // Oldest first
        ],
        take: 20
      });

      return conflicts.map(c => ({
        id: c.id,
        tourId: c.tourId,
        driver: c.tour.driver?.nom_complet || 'Non assigné',
        secteur: c.tour.secteur.nom,
        matricule: c.tour.matricule_vehicule,
        quantite_perdue: c.quantite_perdue,
        montant_dette_tnd: c.montant_dette_tnd,
        depasse_tolerance: c.depasse_tolerance,
        is_surplus: c.quantite_perdue < 0,
        createdAt: c.createdAt
      }));
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/dashboard/conflict/:id - Get conflict details with driver history
  fastify.get('/api/dashboard/conflict/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { id } = request.params as { id: string };

      const conflict = await prisma.conflict.findUnique({
        where: { id },
        include: {
          tour: {
            include: {
              driver: true,
              secteur: true
            }
          }
        }
      });

      if (!conflict) {
        return reply.code(404).send({ error: 'Conflit non trouvé' });
      }

      // Get driver history if driver exists
      let driverHistory = null;
      if (conflict.tour.driverId) {
        // Get all conflicts for this driver
        const driverConflicts = await prisma.conflict.findMany({
          where: {
            tour: { driverId: conflict.tour.driverId }
          },
          include: {
            tour: {
              include: { secteur: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        });

        // Get driver's tours summary
        const driverTours = await prisma.tour.count({
          where: { driverId: conflict.tour.driverId }
        });

        const completedTours = await prisma.tour.count({
          where: { 
            driverId: conflict.tour.driverId,
            statut: 'TERMINEE'
          }
        });

        // Calculate totals
        const totalConflicts = driverConflicts.length;
        const resolvedConflicts = driverConflicts.filter(c => c.statut !== 'EN_ATTENTE').length;
        const pendingConflicts = driverConflicts.filter(c => c.statut === 'EN_ATTENTE').length;
        const totalCaissesLost = driverConflicts
          .filter(c => c.quantite_perdue > 0)
          .reduce((sum, c) => sum + c.quantite_perdue, 0);
        const totalDebt = driverConflicts
          .filter(c => c.quantite_perdue > 0)
          .reduce((sum, c) => sum + c.montant_dette_tnd, 0);

        driverHistory = {
          driver: {
            id: conflict.tour.driver?.id,
            nom_complet: conflict.tour.driver?.nom_complet || 'Non assigné',
            matricule_par_defaut: conflict.tour.driver?.matricule_par_defaut,
            tolerance_caisses_mensuelle: conflict.tour.driver?.tolerance_caisses_mensuelle || 0
          },
          stats: {
            total_tours: driverTours,
            completed_tours: completedTours,
            total_conflicts: totalConflicts,
            resolved_conflicts: resolvedConflicts,
            pending_conflicts: pendingConflicts,
            total_caisses_lost: totalCaissesLost,
            total_debt_tnd: Math.round(totalDebt * 100) / 100
          },
          conflicts: driverConflicts.map(c => ({
            id: c.id,
            date: c.createdAt,
            secteur: c.tour.secteur.nom,
            quantite_perdue: c.quantite_perdue,
            montant_dette_tnd: c.montant_dette_tnd,
            statut: c.statut,
            depasse_tolerance: c.depasse_tolerance,
            is_current: c.id === id
          }))
        };
      }

      return {
        conflict: {
          id: conflict.id,
          tourId: conflict.tourId,
          quantite_perdue: conflict.quantite_perdue,
          montant_dette_tnd: conflict.montant_dette_tnd,
          depasse_tolerance: conflict.depasse_tolerance,
          is_surplus: conflict.quantite_perdue < 0,
          statut: conflict.statut,
          notes_direction: conflict.notes_direction,
          date_approbation_direction: conflict.date_approbation_direction,
          createdAt: conflict.createdAt
        },
        tour: {
          id: conflict.tour.id,
          matricule: conflict.tour.matricule_vehicule,
          secteur: conflict.tour.secteur.nom,
          nbre_caisses_depart: conflict.tour.nbre_caisses_depart,
          nbre_caisses_retour: conflict.tour.nbre_caisses_retour,
          date_sortie: conflict.tour.date_sortie_securite,
          date_entree: conflict.tour.date_entree_securite,
          statut: conflict.tour.statut
        },
        driverHistory
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/dashboard/tours-active - Active tours for monitoring
  fastify.get('/api/dashboard/tours-active', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const tours = await prisma.tour.findMany({
        where: {
          statut: { not: 'TERMINEE' }
        },
        include: {
          driver: true,
          secteur: true
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      return tours.map(t => ({
        id: t.id,
        driver: t.driver?.nom_complet || 'Non assigné',
        secteur: t.secteur.nom,
        matricule: t.matricule_vehicule,
        statut: t.statut,
        caisses_depart: t.nbre_caisses_depart,
        caisses_retour: t.nbre_caisses_retour,
        date_sortie: t.date_sortie_securite,
        date_entree: t.date_entree_securite,
        createdAt: t.createdAt
      }));
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/finance/summary - Finance summary (quantities only for Beta)
  fastify.get('/api/finance/summary', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { month } = request.query as { month?: string };
      
      let startDate: Date;
      let endDate: Date;
      
      if (month) {
        // Format: YYYY-MM
        const [year, m] = month.split('-').map(Number);
        startDate = new Date(year, m - 1, 1);
        endDate = new Date(year, m, 0, 23, 59, 59);
      } else {
        // Current month
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      }

      // Get all tours in period
      const tours = await prisma.tour.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          nbre_caisses_depart: true,
          nbre_caisses_retour: true,
          poids_net_produits_depart: true,
          poids_net_total_calcule: true,
          statut: true
        }
      });

      let caissesLivrees = 0;
      let caissesRetournees = 0;
      let kilosDepart = 0;
      let kilosRetour = 0;

      tours.forEach(tour => {
        caissesLivrees += tour.nbre_caisses_depart;
        caissesRetournees += tour.nbre_caisses_retour || 0;
        kilosDepart += tour.poids_net_produits_depart;
        kilosRetour += tour.poids_net_total_calcule || 0;
      });

      const caissesPerdues = caissesLivrees - caissesRetournees;
      const tauxPerte = caissesLivrees > 0 
        ? Math.round((caissesPerdues / caissesLivrees) * 10000) / 100 
        : 0;

      // Get conflicts stats
      const conflicts = await prisma.conflict.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          statut: true,
          quantite_perdue: true,
          montant_dette_tnd: true
        }
      });

      const conflitsEnAttente = conflicts.filter(c => c.statut === 'EN_ATTENTE').length;
      const conflitsPayes = conflicts.filter(c => c.statut === 'PAYEE').length;
      const conflitsAnnules = conflicts.filter(c => c.statut === 'ANNULE').length;

      return {
        periode: {
          debut: startDate.toISOString(),
          fin: endDate.toISOString()
        },
        caisses: {
          livrees: caissesLivrees,
          retournees: caissesRetournees,
          perdues: caissesPerdues,
          taux_perte: tauxPerte
        },
        kilos: {
          depart: Math.round(kilosDepart * 100) / 100,
          retour: Math.round(kilosRetour * 100) / 100,
          livres: Math.round((kilosDepart - kilosRetour) * 100) / 100
        },
        conflits: {
          total: conflicts.length,
          en_attente: conflitsEnAttente,
          payes: conflitsPayes,
          annules: conflitsAnnules
        },
        tours_total: tours.length,
        tours_terminees: tours.filter(t => t.statut === 'TERMINEE').length
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // POST /api/conflicts/:id/approve - Approve a conflict (Direction)
  fastify.post('/api/conflicts/:id/approve', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { notes } = request.body as { notes?: string };
      const userId = request.user!.id;

      // Check user role
      if (!['DIRECTION', 'ADMIN'].includes(request.user!.role)) {
        return reply.code(403).send({ error: 'Accès non autorisé' });
      }

      // Get conflict to verify it exists
      const conflict = await prisma.conflict.findUnique({
        where: { id },
        include: { tour: { include: { driver: true } } }
      });

      if (!conflict) {
        return reply.code(404).send({ error: 'Conflit non trouvé' });
      }

      if (conflict.statut !== 'EN_ATTENTE') {
        return reply.code(400).send({ error: 'Conflit déjà traité' });
      }

      // Update conflict status to PAYEE (approved = debt will be paid/deducted)
      await prisma.conflict.update({
        where: { id },
        data: {
          statut: 'PAYEE',
          notes_direction: notes,
          direction_id_approbation: userId,
          date_approbation_direction: new Date()
        }
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'CONFLICT_APPROVED',
          targetId: id,
          details_apres: JSON.stringify({
            conflictId: id,
            driverId: conflict.tour.driverId,
            driverName: conflict.tour.driver?.nom_complet || 'Non assigné',
            quantite: conflict.quantite_perdue,
            notes
          })
        }
      });

      return { 
        success: true, 
        message: `Conflit approuvé - dette de ${conflict.montant_dette_tnd} TND confirmée`
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // POST /api/conflicts/:id/reject - Reject/Cancel a conflict (Direction)
  fastify.post('/api/conflicts/:id/reject', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { notes } = request.body as { notes?: string };
      const userId = request.user!.id;

      // Check user role
      if (!['DIRECTION', 'ADMIN'].includes(request.user!.role)) {
        return reply.code(403).send({ error: 'Accès non autorisé' });
      }

      // Get conflict to verify it exists
      const conflict = await prisma.conflict.findUnique({
        where: { id },
        include: { tour: { include: { driver: true } } }
      });

      if (!conflict) {
        return reply.code(404).send({ error: 'Conflit non trouvé' });
      }

      if (conflict.statut !== 'EN_ATTENTE') {
        return reply.code(400).send({ error: 'Conflit déjà traité' });
      }

      // Update conflict status to ANNULE (rejected = no debt)
      await prisma.conflict.update({
        where: { id },
        data: {
          statut: 'ANNULE',
          notes_direction: notes,
          direction_id_approbation: userId,
          date_approbation_direction: new Date()
        }
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'CONFLICT_REJECTED',
          targetId: id,
          details_apres: JSON.stringify({
            conflictId: id,
            driverId: conflict.tour.driverId,
            driverName: conflict.tour.driver?.nom_complet || 'Non assigné',
            quantite: conflict.quantite_perdue,
            notes
          })
        }
      });

      return { 
        success: true, 
        message: 'Conflit annulé - aucune dette' 
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/conflicts/:id - Get conflict details
  fastify.get('/api/conflicts/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { id } = request.params as { id: string };

      const conflict = await prisma.conflict.findUnique({
        where: { id },
        include: {
          tour: {
            include: {
              driver: true,
              secteur: true,
              agentControle: true
            }
          }
        }
      });

      if (!conflict) {
        return reply.code(404).send({ error: 'Conflit non trouvé' });
      }

      return {
        id: conflict.id,
        tourId: conflict.tourId,
        driver: conflict.tour.driver?.nom_complet || 'Non assigné',
        secteur: conflict.tour.secteur.nom,
        matricule: conflict.tour.matricule_vehicule,
        agent_controle: conflict.tour.agentControle.name || conflict.tour.agentControle.email,
        caisses_depart: conflict.tour.nbre_caisses_depart,
        caisses_retour: conflict.tour.nbre_caisses_retour,
        quantite_perdue: conflict.quantite_perdue,
        montant_dette_tnd: conflict.montant_dette_tnd,
        statut: conflict.statut,
        depasse_tolerance: conflict.depasse_tolerance,
        notes_direction: conflict.notes_direction,
        date_tour: conflict.tour.createdAt,
        createdAt: conflict.createdAt,
        date_approbation: conflict.date_approbation_direction
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/dashboard/mouvements - Get all caisse movements (Traçabilité)
  fastify.get('/api/dashboard/mouvements', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const query = request.query as { 
        page?: string; 
        limit?: string; 
        type?: string;
        tourId?: string;
        startDate?: string;
        endDate?: string;
      };
      
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const skip = (page - 1) * limit;
      
      // Build where clause
      const where: any = {};
      
      if (query.type) {
        where.type = query.type;
      }
      
      if (query.tourId) {
        where.tourId = query.tourId;
      }
      
      if (query.startDate || query.endDate) {
        where.createdAt = {};
        if (query.startDate) {
          where.createdAt.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          where.createdAt.lte = new Date(query.endDate);
        }
      }
      
      const [mouvements, total] = await Promise.all([
        prisma.mouvementCaisse.findMany({
          where,
          include: {
            tour: {
              include: {
                driver: true,
                secteur: true,
              },
            },
            conflict: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.mouvementCaisse.count({ where }),
      ]);
      
      return {
        mouvements: mouvements.map(m => ({
          id: m.id,
          type: m.type,
          quantite: m.quantite,
          solde_apres: m.solde_apres,
          notes: m.notes,
          createdAt: m.createdAt,
          tour: m.tour ? {
            id: m.tour.id,
            matricule: m.tour.matricule_vehicule,
            driver: m.tour.driver?.nom_complet || 'Non assigné',
            secteur: m.tour.secteur?.nom || 'Inconnu',
            nbre_caisses_depart: m.tour.nbre_caisses_depart,
            nbre_caisses_retour: m.tour.nbre_caisses_retour,
            date_sortie: m.tour.date_sortie_securite,
            date_entree: m.tour.date_entree_securite,
          } : null,
          conflict: m.conflict ? {
            id: m.conflict.id,
            quantite_perdue: m.conflict.quantite_perdue,
            montant_dette_tnd: m.conflict.montant_dette_tnd,
            statut: m.conflict.statut,
          } : null,
          user: m.user,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/dashboard/pertes - Get all losses (Caisse Bleeding)
  fastify.get('/api/dashboard/pertes', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const query = request.query as { 
        page?: string; 
        limit?: string;
        startDate?: string;
        endDate?: string;
        driverId?: string;
        statut?: string;
      };
      
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const skip = (page - 1) * limit;
      
      // Build where clause for movements that are losses
      const whereMovements: any = {
        type: { in: ['PERTE_CONFIRMEE'] },
      };
      
      if (query.startDate || query.endDate) {
        whereMovements.createdAt = {};
        if (query.startDate) {
          whereMovements.createdAt.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          whereMovements.createdAt.lte = new Date(query.endDate);
        }
      }
      
      // Get all loss movements with related data
      const [pertes, total, stats] = await Promise.all([
        prisma.mouvementCaisse.findMany({
          where: whereMovements,
          include: {
            tour: {
              include: {
                driver: true,
                secteur: true,
              },
            },
            conflict: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.mouvementCaisse.count({ where: whereMovements }),
        // Get aggregate stats
        prisma.mouvementCaisse.aggregate({
          where: whereMovements,
          _sum: { quantite: true },
          _count: { id: true },
        }),
      ]);
      
      // Get total monetary value from conflicts
      const conflictIds = pertes
        .filter(p => p.conflictId)
        .map(p => p.conflictId as string);
      
      let totalDette = 0;
      if (conflictIds.length > 0) {
        const conflictSum = await prisma.conflict.aggregate({
          where: { id: { in: conflictIds } },
          _sum: { montant_dette_tnd: true },
        });
        totalDette = conflictSum._sum.montant_dette_tnd || 0;
      }
      
      // Group by driver for summary
      const driverSummary: Record<string, { nom: string; pertes: number; dette: number; count: number }> = {};
      pertes.forEach(p => {
        const driverName = p.tour?.driver?.nom_complet || 'Inconnu';
        const driverId = p.tour?.driver?.id || 'unknown';
        
        if (!driverSummary[driverId]) {
          driverSummary[driverId] = { nom: driverName, pertes: 0, dette: 0, count: 0 };
        }
        driverSummary[driverId].pertes += Math.abs(p.quantite);
        driverSummary[driverId].dette += p.conflict?.montant_dette_tnd || 0;
        driverSummary[driverId].count += 1;
      });
      
      return {
        pertes: pertes.map(p => ({
          id: p.id,
          quantite: Math.abs(p.quantite),
          notes: p.notes,
          createdAt: p.createdAt,
          tour: p.tour ? {
            id: p.tour.id,
            matricule: p.tour.matricule_vehicule,
            driver: p.tour.driver?.nom_complet || 'Non assigné',
            driverId: p.tour.driver?.id,
            secteur: p.tour.secteur?.nom || 'Inconnu',
            nbre_caisses_depart: p.tour.nbre_caisses_depart,
            nbre_caisses_retour: p.tour.nbre_caisses_retour,
            date_sortie: p.tour.date_sortie_securite,
          } : null,
          conflict: p.conflict ? {
            id: p.conflict.id,
            quantite_perdue: p.conflict.quantite_perdue,
            montant_dette_tnd: p.conflict.montant_dette_tnd,
            statut: p.conflict.statut,
          } : null,
        })),
        stats: {
          totalPertes: Math.abs(stats._sum.quantite || 0),
          totalDette: Math.round(totalDette * 100) / 100,
          totalIncidents: stats._count.id,
        },
        driverSummary: Object.entries(driverSummary).map(([id, data]) => ({
          id,
          ...data,
        })).sort((a, b) => b.pertes - a.pertes),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  console.log('  📊 Dashboard routes registered');
}
