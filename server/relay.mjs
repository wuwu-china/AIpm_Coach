// 无状态大模型中转：只负责把浏览器请求转发到「用户自己选择的厂商」OpenAI 兼容端点。
// - 不保存、不记录、不持久化任何 API Key；
// - 服务端不配置任何 Key（BYOK），token 费用由请求方自己的 Key 承担；
// - 同时被 Vercel Edge Function（api/chat.ts）与本地 Vite 开发中间件复用。
//
// 请求体：{ baseUrl, apiKey, model, messages, temperature }
// 响应：直通上游的 SSE 文本流（text/event-stream）。

/** @param {Request} req @returns {Promise<Response>} */
export async function relayChat(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: '请求体不是合法 JSON' });
  }

  const { baseUrl, apiKey, model, messages, temperature } = body || {};

  if (!apiKey || typeof apiKey !== 'string') {
    return jsonResp(400, { error: '缺少 apiKey（请先在「AI 设置」中填入你自己的 Key）' });
  }
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
    return jsonResp(400, { error: 'baseUrl 必须是 https 地址' });
  }
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return jsonResp(400, { error: '缺少 model 或 messages' });
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: typeof temperature === 'number' ? temperature : 0.5,
      }),
    });
  } catch (e) {
    return jsonResp(502, {
      error: '无法连接到模型厂商（可能是地址错误或被网络拦截）',
      detail: String((e && e.message) || e),
    });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return jsonResp(upstream.status || 502, {
      error: `模型厂商返回错误（HTTP ${upstream.status}）`,
      detail: detail.slice(0, 800),
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

function jsonResp(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
