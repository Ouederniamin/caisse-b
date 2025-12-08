import { createUploadthing, UploadThingError } from "uploadthing/server";
import type { FileRouter } from "uploadthing/server";
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../lib/prisma';

const f = createUploadthing();

// Define the upload router with file routes
export const uploadRouter = {
  // Image uploader for tour photos (depart, retour)
  tourImageUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      // Extract auth from request headers if needed
      // For now, we'll allow uploads and validate on the client side
      return { uploadedAt: new Date().toISOString() };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      console.log("[UploadThing] Upload complete:", file.ufsUrl);
      return { 
        url: file.ufsUrl,
        uploadedAt: metadata.uploadedAt 
      };
    }),

  // Multiple images for hygiene check
  hygieneImageUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 5,
    },
  })
    .middleware(async ({ req }) => {
      return { uploadedAt: new Date().toISOString() };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      console.log("[UploadThing] Hygiene upload complete:", file.ufsUrl);
      return { 
        url: file.ufsUrl,
        uploadedAt: metadata.uploadedAt 
      };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;

// Fastify route handler for UploadThing
export default async function uploadthingRoutes(fastify: FastifyInstance) {
  // Dynamic import to handle the UploadThing adapter
  const { createRouteHandler } = await import("uploadthing/server");
  
  const handler = createRouteHandler({
    router: uploadRouter,
  });

  // Handle GET requests (for fetching upload config)
  fastify.get('/api/uploadthing', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Convert Fastify request to standard Request
      const url = new URL(request.url, `http://${request.headers.host}`);
      const req = new Request(url.toString(), {
        method: 'GET',
        headers: request.headers as HeadersInit,
      });
      
      const response = await handler({ request: req });
      
      // Send response
      reply.code(response.status);
      response.headers.forEach((value: string, key: string) => {
        reply.header(key, value);
      });
      
      const body = await response.text();
      return reply.send(body);
    } catch (error: any) {
      console.error('[UploadThing GET Error]:', error);
      return reply.code(500).send({ error: 'Upload service error' });
    }
  });

  // Handle POST requests (for actual uploads)
  fastify.post('/api/uploadthing', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Convert Fastify request to standard Request
      const url = new URL(request.url, `http://${request.headers.host}`);
      const body = JSON.stringify(request.body);
      
      const req = new Request(url.toString(), {
        method: 'POST',
        headers: {
          ...request.headers as HeadersInit,
          'content-type': 'application/json',
        },
        body,
      });
      
      const response = await handler({ request: req });
      
      // Send response
      reply.code(response.status);
      response.headers.forEach((value: string, key: string) => {
        reply.header(key, value);
      });
      
      const responseBody = await response.text();
      return reply.send(responseBody);
    } catch (error: any) {
      console.error('[UploadThing POST Error]:', error);
      return reply.code(500).send({ error: 'Upload service error' });
    }
  });

  fastify.log.info('📸 UploadThing routes registered');
}
