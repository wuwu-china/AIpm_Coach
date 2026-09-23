import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayChat } from './server/relay.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

// 本地开发时用 Vite 中间件模拟 Vercel 的 /api/chat 无状态中转函数，
// 这样 `npm run dev` 无需任何后端即可联调 BYOK 流式调用。
function devApiRelay(): PluginOption {
  return {
    name: 'aipm-dev-api-relay',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const webReq = new Request('http://local/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.concat(chunks).toString('utf-8'),
          });
          const webRes = await relayChat(webReq);
          res.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await webRes.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String((e as Error)?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApiRelay()],
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
});
