import { defineConfig, loadEnv, type Connect, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleNotionApi } from './server/notion/handler';

/**
 * Mounts the Notion backend routes at /api/notion in the dev and preview
 * servers. NOTION_TOKEN is read server-side only (no VITE_ prefix), so it is
 * never bundled into the browser code.
 */
function notionApi(token: string | undefined): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res) => {
    void handleNotionApi(req, res, { token });
  };
  return {
    name: 'tradelens-notion-api',
    configureServer: (server) => void server.middlewares.use('/api/notion', middleware),
    configurePreviewServer: (server) => void server.middlewares.use('/api/notion', middleware),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), notionApi(env.NOTION_TOKEN || undefined)],
    test: {
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  } as UserConfig;
});
