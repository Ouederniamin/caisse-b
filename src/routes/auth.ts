import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { query } from '../db';

export default async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    try {
      const result = await query(
        'SELECT id, email, password_hash, role, nom_complet FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        nom_complet: user.nom_complet
      });

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          nom_complet: user.nom_complet
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Login failed' });
    }
  });

  // Register (Admin only in production)
  fastify.post('/register', async (request, reply) => {
    const { email, password, role, nom_complet } = request.body as {
      email: string;
      password: string;
      role: string;
      nom_complet: string;
    };

    if (!email || !password || !role || !nom_complet) {
      return reply.code(400).send({ error: 'All fields are required' });
    }

    try {
      // Check if user exists
      const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
      
      if (existingUser.rows.length > 0) {
        return reply.code(409).send({ error: 'User already exists' });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Insert user
      const result = await query(
        'INSERT INTO users (email, password_hash, role, nom_complet) VALUES ($1, $2, $3, $4) RETURNING id, email, role, nom_complet',
        [email, password_hash, role, nom_complet]
      );

      return reply.code(201).send({
        user: result.rows[0]
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Registration failed' });
    }
  });

  // Get current user
  fastify.get('/me', {
    preHandler: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    }]
  }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
