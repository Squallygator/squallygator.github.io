// Renvoie le CV uniquement si le jeton Turnstile est valide.
// Secret attendu : TURNSTILE_SECRET (wrangler secret put). PDF stocké dans KV sous la clé "cv".
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const fail = (status, msg) => new Response(msg, { status, headers: cors });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' || request.headers.get('Origin') !== env.ALLOWED_ORIGIN) {
      return fail(403, 'Forbidden');
    }

    let token;
    try { ({ token } = await request.json()); } catch { return fail(400, 'Bad request'); }
    if (!token) return fail(400, 'Missing token');

    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', token);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) form.append('remoteip', ip);

    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const result = await check.json();
    if (!result.success || `https://${result.hostname}` !== env.ALLOWED_ORIGIN) {
      return fail(403, 'Captcha invalide');
    }

    const pdf = await env.CV.get('cv', 'arrayBuffer');
    if (!pdf) return fail(404, 'CV introuvable');

    return new Response(pdf, {
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="CV.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  },
};
