// Vercel Edge Function：POST /api/chat
// 无状态 BYOK 中转，逻辑与本地 Vite 开发中间件完全一致（见 server/relay.mjs）。
export const config = { runtime: 'edge' };

// @ts-expect-error - 纯 ESM 中转实现，Edge 运行时可直接打包
import { relayChat } from '../server/relay.mjs';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  return relayChat(req);
}
