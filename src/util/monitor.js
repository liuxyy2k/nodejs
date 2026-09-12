import { EventEmitter } from 'events';

const MAX_EVENTS = 50;
const MAX_BODY = 50 * 1024;
const MAX_RESPONSE = 100 * 1024;

let eventId = 0;

function truncate(text, max) {
  if (text == null) return '';
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max)}\n...[已截断 ${s.length - max} 字符]`;
}

class MonitorStore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
    this.events = [];
  }

  push(event) {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.emit('event', event);
  }

  history(limit) {
    return this.events.slice(-limit);
  }

  clear() {
    this.events = [];
    this.emit('clear');
  }
}

export const monitorStore = new MonitorStore();

export function installMonitorHook(fastify, prefix, { db } = {}) {
  fastify.addHook('preHandler', async (req) => {
    try {
      if (!(req.url || '').split('?')[0].startsWith(prefix)) return;
      req._monitor = {
        startAt: Date.now(),
        body: truncate(JSON.stringify(req.body ?? {}), MAX_BODY),
        query: req.query || {},
        ip: req.ip || '',
      };
    } catch {}
  });

  fastify.addHook('onSend', async (req, reply, payload) => {
    const meta = req._monitor;
    if (!meta) return payload;
    try {
      let output = payload;
      if (typeof payload === 'string') {
        try {
          const json = JSON.parse(payload);
          if (json && typeof json === 'object') {
          const { maybeRewritePlay } = await import('./m3u8Gateway.js').catch(() => ({}));
          const rewritten = maybeRewritePlay ? await maybeRewritePlay(req, json, { db }) : null;
            if (rewritten) output = JSON.stringify(rewritten);
          }
        } catch {}
      }

      const path = (req.url || '').split('?')[0];
      const parts = path.split('/').filter(Boolean);
      let responseText = '';
      if (typeof output === 'string') responseText = output;
      else if (Buffer.isBuffer(output)) responseText = output.toString();
      else if (output != null) {
        try { responseText = JSON.stringify(output); } catch { responseText = String(output); }
      }

      monitorStore.push({
        id: ++eventId,
        time: new Date().toISOString(),
        method: req.method,
        path,
        query: meta.query,
        spider: parts[1] || '',
        type: parts[2] || '',
        endpoint: parts[3] || '',
        body: meta.body,
        ip: meta.ip,
        status: reply.statusCode,
        duration: Date.now() - meta.startAt,
        response: truncate(responseText, MAX_RESPONSE),
      });
      return output !== payload ? output : payload;
    } catch {
      return payload;
    }
  });
}

export default async function monitorRoutes(fastify) {
  fastify.get('/monitor/history', async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_EVENTS);
    return monitorStore.history(limit);
  });

  fastify.get('/monitor/clear', async () => {
    monitorStore.clear();
    return { ok: true };
  });

  fastify.get('/monitor/stream', async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const onEvent = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    monitorStore.on('event', onEvent);

    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch {}
    }, 20000);

    const cleanup = () => {
      monitorStore.off('event', onEvent);
      clearInterval(ping);
    };
    res.on('close', cleanup);
    req.raw.on('close', cleanup);
  });
}
