import { loadEnvironmentFiles } from '@inkeep/agents-core';

loadEnvironmentFiles();
import './instrumentation.js';
import 'hono';

import { createAgentsApp } from '@inkeep/agents-api/factory';
import type { Hono } from 'hono';
import { credentialStores } from '../../shared/credential-stores.js';

const inkeep_agents_api_port = 3002;

// Social OAuth providers — only wired in when env vars are present.
// Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for Google login.
// Set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET for Microsoft login.
const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    }),
  ...(process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET && {
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      },
    }),
};

// Create the Hono app
const app: Hono = createAgentsApp({
  serverConfig: {
    port: inkeep_agents_api_port,
    serverOptions: {
      requestTimeout: 60000,
      keepAliveTimeout: 60000,
      keepAlive: true,
    },
  },
  credentialStores,
  ...(Object.keys(socialProviders).length > 0 && {
    auth: { socialProviders },
  }),
});

export default app;
