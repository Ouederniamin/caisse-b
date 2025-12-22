// BetterAuth requires ESM, using dynamic import
import bcrypt from 'bcryptjs';

let auth: any;

export async function initAuth() {
  const { betterAuth } = await import("better-auth");
  const { prismaAdapter } = await import("better-auth/adapters/prisma");
  const prisma = (await import("./prisma")).default;
  
  auth = betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    emailAndPassword: {
      enabled: true,
      // Use bcrypt for password hashing (compatible with seed data)
      password: {
        hash: async (password: string) => {
          return await bcrypt.hash(password, 10);
        },
        verify: async ({ hash, password }: { hash: string; password: string }) => {
          return await bcrypt.compare(password, hash);
        },
      },
    },
    trustedOrigins: [
      "http://localhost:3000",  // Web app
      "http://localhost:8081",  // Mobile web
      "exp://*",                // Expo development
    ],
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "AGENT_CONTROLE",
        },
      },
    },
  });
  
  return auth;
}

export { auth };
