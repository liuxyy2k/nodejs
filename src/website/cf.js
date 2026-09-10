/**
 * CF Clearance 接收接口
 * 供 Shadowrocket 过盾后把 cookie / UA 推送到本机 Node 服务
 *
 * POST /website/cf/cookie
 * GET  /website/cf/cookie?domain=missav.live
 * DELETE /website/cf/cookie?domain=missav.live
 */

const MISSAV_HOSTS = new Set([
    'missav.ws',
    'missav.live',
    'missav.com',
    'missav.app',
]);

function registrableDomain(host) {
    if (!host) return '';
    const h = String(host).toLowerCase().replace(/:\d+$/, '');
    const parts = h.split('.');
    if (parts.length <= 2) return h;
    return parts.slice(-2).join('.');
}

function normalizeDomain(input) {
    if (!input) return '';
    let s = String(input).trim().toLowerCase();
    try {
        if (s.includes('://')) s = new URL(s).hostname;
    } catch {
        /* ignore */
    }
    s = s.replace(/:\d+$/, '').replace(/^\.+/, '');
    return registrableDomain(s);
}

function isMissav(domain) {
    return MISSAV_HOSTS.has(domain) || domain.startsWith('missav.');
}

function storeKey(domain) {
    return `/cfClearance/${domain.replace(/\./g, '_')}`;
}

async function saveClearance(db, payload) {
    const domain = normalizeDomain(payload.domain || payload.host || '');
    if (!domain) throw new Error('domain required');

    const cookies = String(payload.cookies || payload.cookie || '').trim();
    const ua = String(payload.ua || payload.userAgent || '').trim();
    let clearance = String(payload.cf_clearance || payload.clearance || '').trim();

    if (!clearance && cookies) {
        const m = cookies.match(/(?:^|;\s*)cf_clearance=([^;]+)/);
        if (m) clearance = m[1];
    }
    if (!clearance && !cookies) throw new Error('cf_clearance or cookies required');

    const finalCookies =
        cookies ||
        (clearance ? `cf_clearance=${clearance}` : '');

    const data = {
        domain,
        cf_clearance: clearance,
        cookies: finalCookies,
        ua,
        savedAt: Date.now(),
        source: payload.source || 'shadowrocket',
    };

    await db.push(storeKey(domain), data);

    // 兼容 miss.js 现有读取路径
    if (isMissav(domain)) {
        await db.push('/missavCookie', finalCookies);
        if (ua) await db.push('/missavUa', ua);
        if (domain && domain !== 'missav.live') {
            await db.push('/missavSite', { missav: domain });
        }
    }

    return data;
}

async function loadClearance(db, domain) {
    domain = normalizeDomain(domain);
    if (!domain) return null;
    try {
        return await db.getData(storeKey(domain));
    } catch {
        return null;
    }
}

async function clearClearance(db, domain) {
    domain = normalizeDomain(domain);
    if (!domain) return;
    try {
        await db.delete(storeKey(domain));
    } catch {
        /* ignore */
    }
    if (isMissav(domain)) {
        try {
            await db.push('/missavCookie', '');
            await db.push('/missavUa', '');
        } catch {
            /* ignore */
        }
    }
}

export default async function cf(fastify) {
    // 健康检查 / 说明
    fastify.get('/', async (_req, res) => {
        res.send({
            code: 0,
            name: 'cf-clearance bridge',
            endpoints: {
                push: 'POST /website/cf/cookie',
                get: 'GET /website/cf/cookie?domain=missav.live',
                del: 'DELETE /website/cf/cookie?domain=missav.live',
            },
        });
    });

    // Shadowrocket 推送 cookie
    fastify.post('/cookie', async (req, res) => {
        try {
            const body = req.body || {};
            const data = await saveClearance(req.server.db, body);
            console.log(`[cf] saved clearance for ${data.domain}`);
            res.send({ code: 0, data });
        } catch (e) {
            res.code(400).send({ code: 1, msg: e.message || String(e) });
        }
    });

    // 也支持 GET 带 query 推送（方便调试）
    fastify.get('/cookie', async (req, res) => {
        const domain = normalizeDomain(req.query?.domain || 'missav.live');
        // 若带 cookies/ua 参数则视为写入
        if (req.query?.cookies || req.query?.cf_clearance) {
            try {
                const data = await saveClearance(req.server.db, {
                    domain,
                    cookies: req.query.cookies,
                    cf_clearance: req.query.cf_clearance,
                    ua: req.query.ua,
                    source: 'get',
                });
                return res.send({ code: 0, data });
            } catch (e) {
                return res.code(400).send({ code: 1, msg: e.message || String(e) });
            }
        }
        const data = await loadClearance(req.server.db, domain);
        // missav 兜底读旧 key
        if (!data && isMissav(domain)) {
            try {
                const cookies = (await req.server.db.getData('/missavCookie')) || '';
                const ua = (await req.server.db.getData('/missavUa')) || '';
                if (cookies) {
                    return res.send({
                        code: 0,
                        data: { domain, cookies, ua, source: 'missavCookie' },
                    });
                }
            } catch {
                /* ignore */
            }
        }
        res.send({ code: 0, data: data || null });
    });

    fastify.delete('/cookie', async (req, res) => {
        const domain = normalizeDomain(req.query?.domain || req.body?.domain || 'missav.live');
        await clearClearance(req.server.db, domain);
        res.send({ code: 0 });
    });
}
