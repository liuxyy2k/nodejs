import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { load } from 'cheerio';
import req from '../../util/req.js';

function toArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
}

/* ==========================================================================
 *  JAV Verse  ·  https://javverse.com
 *  日本成人影片资料库(番号 / 女优 / 片商 / 类别 / 发售时间线)
 *  ---------------------------------------------------------------------
 *  【登录说明】站点用 Supabase Auth,片源接口(/api/video/*)必须登录态。
 *  三选一填进插件配置 ext 里(优先级从上到下):
 *
 *   1) refreshToken —— 最省事,一次搞定长期有效
 *      浏览器登录 javverse.com → F12 → Application → Local Storage →
 *      找键名 sb-ywapzolifdkuecxktlio-auth-token → 复制整段 JSON 里的
 *      refresh_token 值填进来。插件会用它在后台自动换新登录态。
 *
 *   2) email + password —— 直连账号密码
 *      注意:站点登录挂了一道 Cloudflare 人机校验,纯后台请求过不去,
 *      除非站点把校验关掉,或者你把一次性的 captchaToken 一起传进来。
 *      所以这条路能填,但失败时请改用上面第 1 条。
 *
 *   3) cookie —— 从浏览器 F12 直接复制整串 Cookie 贴进来(含 sb-xxx-auth-token)
 *
 *  没填任何登录信息时:番号 / 封面 / 出演者 / 类别 / 时长 / 片商 / 剧照
 *  全部照常浏览,只是点播时提示「需登录观看」。
 *
 *  【播放入口】站点真实链路(照站点前端代码 1:1 复刻):
 *   POST /api/video/prepare  { workId, code, includeLine2 } -> 档位列表
 *   POST /api/video/sessions { workId, code, variant }      -> 线路1 m3u8
 *   POST /api/video/line2    { workId, code, variant }      -> 线路2 直链
 *   POST /api/video/sessions/refresh { sessionId, ... }     -> 续期播放会话
 * ========================================================================== */

const META_KEY = 'javverse';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://javverse.com';
/** 点播代理暂存鉴权(TV 端往往不会把 play.header 带给分片/MP4) */
const PLAY_AUTH_TTL_MS = 6 * 60 * 60 * 1000;

// 站点前端公开的 Supabase 配置(用于账号登录)
const SB_URL = 'https://ywapzolifdkuecxktlio.supabase.co';
const SB_KEY = 'sb_publishable_RVM-nNRj_UAyA0De2QPlhA_OuF-gWm7';
const SB_REF = 'ywapzolifdkuecxktlio';
const SB_COOKIE = `sb-${SB_REF}-auth-token`;

// 登录配置(init 时从 ext 读入)
const cfg = {
    cookie: '',
    email: 'liuxy01999@gmail.com',
    password: '12345678',
    captchaToken: '',
    accessToken: '',
    refreshToken: 'base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSkZVekkxTmlJc0ltdHBaQ0k2SW1SalpUa3dabU15TFRsa1lqRXRORE01TmkwNVlqVmtMVEk1TVdRMU0ySmlNbUl3T0NJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUpvZEhSd2N6b3ZMM2wzWVhCNmIyeHBabVJyZFdWamVHdDBiR2x2TG5OMWNHRmlZWE5sTG1OdkwyRjFkR2d2ZGpFaUxDSnpkV0lpT2lJME5tWmpZekF4WmkwME9USmtMVFEyWTJRdE9ERmlOQzB4WlRCa05qVXpZakk1TVRRaUxDSmhkV1FpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWlhod0lqb3hOemt4T1RjNU9UTTNMQ0pwWVhRaU9qRTNPVEU1TnpZek16Y3NJbVZ0WVdsc0lqb2liR2wxZUhrd01UazVPVUJuYldGcGJDNWpiMjBpTENKd2FHOXVaU0k2SWlJc0ltRndjRjl0WlhSaFpHRjBZU0k2ZXlKd2NtOTJhV1JsY2lJNkltVnRZV2xzSWl3aWNISnZkbWxrWlhKeklqcGJJbVZ0WVdsc0lsMTlMQ0oxYzJWeVgyMWxkR0ZrWVhSaElqcDdJbVZ0WVdsc0lqb2liR2wxZUhrd01UazVPVUJuYldGcGJDNWpiMjBpTENKbGJXRnBiRjkyWlhKcFptbGxaQ0k2ZEhKMVpTd2ljR2h2Ym1WZmRtVnlhV1pwWldRaU9tWmhiSE5sTENKemRXSWlPaUkwTm1aall6QXhaaTAwT1RKa0xUUTJZMlF0T0RGaU5DMHhaVEJrTmpVellqSTVNVFFpZlN3aWNtOXNaU0k2SW1GMWRHaGxiblJwWTJGMFpXUWlMQ0poWVd3aU9pSmhZV3d4SWl3aVlXMXlJanBiZXlKdFpYUm9iMlFpT2lKd1lYTnpkMjl5WkNJc0luUnBiV1Z6ZEdGdGNDSTZNVGM1TVRrM05qTXpOMzFkTENKelpYTnphVzl1WDJsa0lqb2lNbUZoTWpka1lqWXRPVEl4TVMwME5EUTRMV0V5WkdFdE1UazFObU5sT0Rnek1USTNJaXdpYVhOZllXNXZibmx0YjNWeklqcG1ZV3h6WlgwLjF6Rkc0aFhYOE5fMFpDUUswVnhJN3lxLS1XV1Ztem94dzAwUGlHaHdaRlY3MFY4S2hJeF8zSnB3X1FaVEJUM1hkMnhGS0JOcUlRM05yNFhra0J6QV9RIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsImV4cGlyZXNfaW4iOjM2MDAsImV4cGlyZXNfYXQiOjE3OTE5Nzk5MzcsInJlZnJlc2hfdG9rZW4iOiJkZjd3bWJkejM1eHgiLCJ1c2VyIjp7ImlkIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZW1haWwiOiJsaXV4eTAxOTk5QGdtYWlsLmNvbSIsImVtYWlsX2NvbmZpcm1lZF9hdCI6IjIwMjYtMTAtMTFUMDY6MzY6MjYuMDIzNzA1WiIsInBob25lIjoiIiwiY29uZmlybWF0aW9uX3NlbnRfYXQiOiIyMDI2LTEwLTExVDA2OjM2OjA4LjUzMTAyNFoiLCJjb25maXJtZWRfYXQiOiIyMDI2LTEwLTExVDA2OjM2OjI2LjAyMzcwNVoiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI2LTEwLTE0VDExOjEyOjE3LjI1MTI3MDM1MloiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImxpdXh5MDE5OTlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0In0sImlkZW50aXRpZXMiOlt7ImlkZW50aXR5X2lkIjoiMDViMjYwNWEtZjUyOS00NDAxLTkzM2UtYWU5Yjc1ZjEwMTllIiwiaWQiOiI0NmZjYzAxZi00OTJkLTQ2Y2QtODFiNC0xZTBkNjUzYjI5MTQiLCJ1c2VyX2lkIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0IiwiaWRlbnRpdHlfZGF0YSI6eyJlbWFpbCI6ImxpdXh5MDE5OTlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0In0sInByb3ZpZGVyIjoiZW1haWwiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI2LTEwLTExVDA2OjM2OjA4LjUxMTM3NFoiLCJjcmVhdGVkX2F0IjoiMjAyNi0xMC0xMVQwNjozNjowOC41MTE0NDNaIiwidXBkYXRlZF9hdCI6IjIwMjYtMTAtMTFUMDY6MzY6MDguNTExNDQzWiIsImVtYWlsIjoibGl1eHkwMTk5OUBnbWFpbC5jb20ifV0sImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTExVDA2OjM2OjA4LjQ2MDc5WiIsInVwZGF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjEyOjE3LjMwNTQwOVoiLCJpc19hbm9ueW1vdXMiOmZhbHNlfSwid2Vha19wYXNzd29yZCI6bnVsbH0',
};

// 运行中的登录态
let session = null; // { access_token, refresh_token, expires_at, user }
let authMsg = '';
let refreshFailAt = 0;
/** /api/video/sessions 下发的 HttpOnly 密钥,拉 m3u8 必须带上 */
let videoKeyCookie = '';
const playAuthStore = new Map();

/* --------------------------------------------------------------------------
 *  登录态落盘
 *  Supabase 的 refreshToken 是「用一次换一次」的轮换制:每次自动续期后,
 *  旧 token 立刻作废。原来只存在内存里,进程一重启就又拿源码里那条早作废
 *  的 token 去换,结果就是「明明刚还能播,重启后登录失效」。这里把轮换后的
 *  新 token 存到旁边文件里,重启接着用。
 * ------------------------------------------------------------------------ */
const AUTH_STORE_FILE = (() => {
    if (process.env.JAVVERSE_AUTH_FILE) return process.env.JAVVERSE_AUTH_FILE;
    // 放临时目录而不是插件目录:有的框架会监听插件目录热重载,
    // 写文件分分钟触发无限重载。想换位置就设 JAVVERSE_AUTH_FILE。
    try {
        const dir = path.join(os.tmpdir(), 'javverse-plugin');
        fs.mkdirSync(dir, { recursive: true });
        return path.join(dir, 'auth.json');
    } catch {
        return '';
    }
})();

let persistedRT = (() => {
    if (!AUTH_STORE_FILE) return '';
    try {
        const j = JSON.parse(fs.readFileSync(AUTH_STORE_FILE, 'utf8'));
        return (j && j.refresh_token) || '';
    } catch {
        return '';
    }
})();

function persistRefreshToken(rt) {
    const token = String(rt || '').trim();
    if (!token || token === persistedRT || !AUTH_STORE_FILE) return;
    persistedRT = token;
    try {
        fs.writeFileSync(AUTH_STORE_FILE, JSON.stringify({ refresh_token: token, savedAt: new Date().toISOString() }), { mode: 0o600 });
    } catch {
        /* 目录只读就算了,不影响本次运行 */
    }
}

/* --------------------------------------------------------------------------
 *  基础请求
 * ------------------------------------------------------------------------ */
function baseHeaders(referer = `${site}/`) {
    return {
        'User-Agent': UA,
        Referer: referer,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        Connection: 'keep-alive',
    };
}

function abs(u) {
    if (!u) return '';
    const s = String(u).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : `/${s}`);
}

function b64url(s) {
    return Buffer.from(String(s), 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function unb64url(s) {
    return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function prunePlayAuthStore() {
    const now = Date.now();
    for (const [k, v] of playAuthStore) {
        if (!v || v.expires < now) playAuthStore.delete(k);
    }
}

function storePlayAuth(headers) {
    prunePlayAuthStore();
    const token = crypto.randomBytes(12).toString('hex');
    playAuthStore.set(token, {
        headers: {
            'User-Agent': headers['User-Agent'] || UA,
            Referer: headers.Referer || `${site}/`,
            Accept: '*/*',
            ...(headers.Authorization ? { Authorization: headers.Authorization } : {}),
            ...(headers.Cookie ? { Cookie: headers.Cookie } : {}),
        },
        expires: Date.now() + PLAY_AUTH_TTL_MS,
    });
    return token;
}

const ROUTE_SUFFIX_RE = /\/(init|home|category|detail|play|search)\/?$/i;

function pluginPrefixOf(inReq) {
    try {
        const full = String(inReq?.raw?.url || inReq?.url || '').split('?')[0];
        if (full && ROUTE_SUFFIX_RE.test(full)) return full.replace(ROUTE_SUFFIX_RE, '');
    } catch {
        /* 落到下面 */
    }
    const prefix = inReq?.server?.prefix;
    if (typeof prefix === 'string') return prefix === '/' ? '' : prefix.replace(/\/+$/, '');
    return `/spider/${META_KEY}/3`;
}

function proxyStreamPath(inReq, targetUrl, referer, token) {
    try {
        const srv = inReq?.server;
        const addr = srv?.address?.();
        const dynamic = addr?.dynamic || 'js2p://_WEB_';
        const prefix = pluginPrefixOf(inReq);
        const qs = `t=${token}&u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
        if (dynamic) return `${dynamic}${prefix}/proxy/stream?${qs}`;
        if (addr?.url) return `${addr.url}${prefix}/proxy/stream?${qs}`;
        return '';
    } catch {
        return '';
    }
}

function needsStreamProxy(url) {
    const u = String(url || '');
    return /javverse\.com\/api\/video\//i.test(u) || u.startsWith('/api/video/');
}

function rewriteJvM3u8(raw, playlistUrl, selfBase, referer, token) {
    const lines = String(raw).split(/\r?\n/);
    const mapLine = (line) => {
        const s = line.trim();
        if (!s || s.startsWith('#')) {
            if (s.includes('URI="')) {
                return line.replace(/URI="([^"]+)"/g, (_, uri) => {
                    try {
                        const absUri = new URL(uri, playlistUrl).href;
                        return `URI="${selfBase}/proxy/stream?t=${token}&u=${b64url(absUri)}&r=${b64url(referer || '')}"`;
                    } catch {
                        return line;
                    }
                });
            }
            return line;
        }
        try {
            const absUri = new URL(s, playlistUrl).href;
            return `${selfBase}/proxy/stream?t=${token}&u=${b64url(absUri)}&r=${b64url(referer || '')}`;
        } catch {
            return line;
        }
    };
    return lines.map(mapLine).join('\n');
}

function copyUpstreamHeaders(reply, hdrs, extra = {}) {
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
        if (hdrs?.[key] !== undefined) reply.header(key, hdrs[key]);
    }
    Object.entries(extra).forEach(([k, v]) => reply.header(k, v));
}

function playlistSelfBase(request) {
    const urlPath = String(request.url || '').split('?')[0];
    const prefix = urlPath.replace(/\/proxy\/stream\/?$/i, '') || `/spider/${META_KEY}/3`;
    const srv = request.server;
    const dynamic = srv?.address?.()?.dynamic || '';
    const host = request.headers?.host;
    if (dynamic) return `${dynamic}${prefix}`;
    if (host) return `http://${host}${prefix}`;
    const port = srv?.address?.()?.port;
    if (port) return `http://127.0.0.1:${port}${prefix}`;
    return '';
}

async function streamProxy(request, reply) {
    const q = request?.query || {};
    const token = q.t;
    const entry = playAuthStore.get(token);
    if (!entry || entry.expires < Date.now()) {
        reply.code(403).send('play auth expired, replay');
        return;
    }
    let target = '';
    let referer = `${site}/`;
    try {
        target = unb64url(q.u);
        if (q.r) referer = unb64url(q.r) || referer;
    } catch {
        reply.code(400).send('bad u');
        return;
    }
    if (!/^https?:\/\//.test(target)) {
        reply.code(400).send('bad u');
        return;
    }
    const headers = {
        ...entry.headers,
        Referer: referer,
        'Accept-Encoding': 'identity',
        Accept: '*/*',
    };
    const range = request.headers?.range ? String(request.headers.range) : '';
    if (range) headers.Range = range;
    if (request.headers?.['if-range']) headers['If-Range'] = String(request.headers['if-range']);

    const likelyPlaylist = /\.m3u8(\?|#|$)/i.test(target)
        || /\/api\/video\/media\/stream\?/i.test(target);

    if (likelyPlaylist) {
        let pl;
        try {
            pl = await req.get(target, {
                headers,
                timeout: 120000,
                validateStatus: () => true,
                responseType: 'text',
                maxRedirects: 5,
            });
        } catch (e) {
            reply.code(502).send(String(e.message || 'upstream'));
            return;
        }
        const raw = typeof pl.data === 'string' ? pl.data : String(pl.data || '');
        if (!raw.includes('#EXTM3U')) {
            reply.code(pl.status >= 200 && pl.status < 600 ? pl.status : 502).send(raw.slice(0, 500));
            return;
        }
        const selfBase = playlistSelfBase(request);
        if (!selfBase) {
            reply.code(302).header('Location', target).send();
            return;
        }
        reply.code(200);
        copyUpstreamHeaders(reply, pl.headers, {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Cache-Control': 'no-cache',
        });
        reply.send(rewriteJvM3u8(raw, target, selfBase, referer, token));
        return;
    }

    let resp;
    try {
        resp = await req.get(target, {
            headers,
            timeout: 120000,
            validateStatus: () => true,
            responseType: 'stream',
            maxRedirects: 5,
        });
    } catch (e) {
        reply.code(502).send(String(e.message || 'upstream'));
        return;
    }
    const upStream = resp.data;
    if (!upStream) {
        reply.code(502).send('upstream');
        return;
    }

    const status = resp.status >= 200 && resp.status < 600 ? resp.status : 502;
    if (status === 204 || status === 304) {
        try {
            upStream.destroy?.();
        } catch {
            /* ignore */
        }
        reply.code(status).header('Cache-Control', 'no-cache').send();
        return;
    }

    reply.code(status);
    copyUpstreamHeaders(reply, resp.headers, { 'Cache-Control': 'no-cache' });

    const close = () => {
        try {
            upStream.destroy?.();
        } catch {
            /* ignore */
        }
    };
    request.raw?.once?.('aborted', close);
    request.raw?.once?.('close', close);
    reply.raw?.once?.('close', close);

    try {
        await reply.send(upStream);
    } catch (e) {
        close();
        if (!reply.sent) reply.code(502).send(String(e.message || 'upstream stream'));
    }
}

function pickLine2File(data) {
    if (!data || typeof data !== 'object') return '';
    return data.fileUrl || data.file_url || data.url || '';
}

function pickPlaylist(data) {
    if (!data || typeof data !== 'object') return '';
    return data.playlistUrl || data.playlist_url || data.m3u8Url || data.hlsUrl
        || data.streamUrl || data.stream?.playlistUrl || data.stream?.url
        || (typeof data.playlist === 'string' ? data.playlist : '');
}

async function httpJson(url, opt = {}) {
    const method = String(opt.method || 'GET').toUpperCase();
    const headers = { ...(opt.headers || {}) };
    const config = {
        method,
        url,
        headers,
        timeout: 30000,
        validateStatus: () => true,
        responseType: 'text',
    };
    if (method !== 'GET' && opt.body !== undefined) {
        config.data = opt.body;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    try {
        const r = await req(config);
        let data = r.data;
        if (typeof data === 'string') {
            const trimmed = data.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try { data = JSON.parse(trimmed); } catch { data = { text: data.slice(0, 400) }; }
            } else {
                data = trimmed;
            }
        }
        return { status: r.status, data };
    } catch (e) {
        return { status: e.response?.status || 0, data: e.response?.data || { error: e.message } };
    }
}

function isCfBlock(html) {
    const s = String(html || '');
    return !s || s.includes('Just a moment') || s.includes('请稍候') || s.includes('cf-browser-verification') || s.includes('challenges.cloudflare.com');
}

let browseCookie = '';
let gateReadyAt = 0;
const GATE_TTL_MS = 12 * 60 * 60 * 1000;

function mergeBrowseCookie(setCookie) {
    const jar = {};
    for (const part of String(browseCookie || '').split(';')) {
        const pair = part.trim();
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i)] = pair;
    }
    for (const raw of toArray(setCookie)) {
        const pair = String(raw).split(';')[0].trim();
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i)] = pair;
    }
    browseCookie = Object.values(jar).join('; ');
}

function captureBrowse(setCookie) {
    mergeBrowseCookie(setCookie);
}

function isBrowseGatePage(html) {
    const s = String(html || '');
    if (s.includes('work-card') && s.includes('"workId":')) return false;
    return s.includes('fetch("/_browse/gate"') || (s.includes('id="opening"') && s.includes('jv-gate-try'));
}

async function ensureBrowseGate(force = false, depth = 0) {
    if (!force && gateReadyAt && Date.now() - gateReadyAt < GATE_TTL_MS && browseCookie.includes('__Host-jv-browse=')) {
        return true;
    }
    const headers = {
        ...baseHeaders(`${site}/discover`),
        'x-jv-gate': '1',
        Origin: site,
    };
    if (browseCookie) headers.Cookie = browseCookie;
    const r = await req({
        method: 'POST',
        url: `${site}/_browse/gate`,
        headers,
        timeout: 30000,
        validateStatus: () => true,
        responseType: 'text',
    });
    captureBrowse(r.headers['set-cookie']);
    if (r.headers['set-cookie']?.length) req.saveCookies(true);
    if (r.status === 204) {
        gateReadyAt = Date.now();
        return true;
    }
    if (r.status === 429) {
        try {
            const body = JSON.parse(String(r.data || '{}'));
            const verify = body?.verifyUrl;
            if (typeof verify === 'string' && verify.startsWith('/')) {
                const vr = await req({
                    method: 'GET',
                    url: abs(verify),
                    headers: { ...baseHeaders(`${site}/discover`), Cookie: browseCookie || undefined },
                    timeout: 30000,
                    validateStatus: () => true,
                    responseType: 'text',
                });
                captureBrowse(vr.headers['set-cookie']);
                if (vr.headers['set-cookie']?.length) req.saveCookies(true);
                // 原来无条件递归,遇到持续 429 + verifyUrl 会一直往下套
                if (depth < 2) return ensureBrowseGate(true, depth + 1);
            }
        } catch {
            /* 429 无 verifyUrl */
        }
    }
    return browseCookie.includes('__Host-jv-browse=');
}

function rscOk(text) {
    return text && text.includes('work-card') && text.includes('"workId":') && !isCfBlock(text) && !isBrowseGatePage(text);
}

async function reqRsc(url) {
    const u = new URL(url);
    const headers = {
        ...baseHeaders(`${site}/`),
        Accept: '*/*',
        RSC: '1',
        'Next-Url': `${u.pathname}${u.search}`,
    };
    if (browseCookie) headers.Cookie = browseCookie;
    const r = await req({
        method: 'GET',
        url,
        headers,
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: () => true,
        responseType: 'text',
    });
    captureBrowse(r.headers['set-cookie']);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
        const next = new URL(r.headers.location, site).href;
        if (browseCookie) headers.Cookie = browseCookie;
        const r2 = await req({
            method: 'GET',
            url: next,
            headers,
            timeout: 30000,
            validateStatus: () => true,
            responseType: 'text',
        });
        captureBrowse(r2.headers['set-cookie']);
        return typeof r2.data === 'string' ? r2.data : String(r2.data || '');
    }
    return typeof r.data === 'string' ? r.data : String(r.data || '');
}

async function getRsc(url) {
    await ensureBrowseGate();
    try {
        const text = await reqRsc(url);
        if (rscOk(text)) return text;
    } catch {
        /* 重试 gate */
    }
    gateReadyAt = 0;
    await ensureBrowseGate(true);
    try {
        const text = await reqRsc(url);
        return rscOk(text) ? text : '';
    } catch {
        return '';
    }
}

async function getPublicHtml(url, referer = `${site}/`) {
    try {
        const r = await req.get(url, {
            headers: mergeCookieHeader(baseHeaders(referer)),
            timeout: 30000,
            validateStatus: () => true,
            responseType: 'text',
        });
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

function isCatalogUrl(url) {
    return /\/(discover|works|search|work\/|genre\/|maker\/|actress\/|label\/|series\/|code\/)/.test(String(url || ''));
}

// 浏览列表/详情用游客头;带 Supabase Cookie 的 GET 容易触发 Cloudflare
async function getHtml(url, referer) {
    // 详情页(/work/123)本来就没有 work-card,走 RSC 那套永远命中不了,
    // 只会白跑两次请求、白白刷站点频率。列表页才走 RSC。
    const detailLike = /\/work\/\d+/.test(String(url || ''));
    if (!detailLike && isCatalogUrl(url)) {
        const rsc = await getRsc(url);
        if (rsc && rsc.includes('work-card')) return rsc;
    }
    let html = await getPublicHtml(url, referer || `${site}/`);
    if (isCfBlock(html) && hasAuth() && !isCatalogUrl(url)) {
        await ensureSession();
        try {
            const r = await req.get(url, {
                headers: authHeaders(referer || `${site}/`),
                timeout: 30000,
                validateStatus: () => true,
                responseType: 'text',
            });
            const authHtml = typeof r.data === 'string' ? r.data : String(r.data || '');
            if (!isCfBlock(authHtml)) html = authHtml;
        } catch {
            /* keep guest html */
        }
    }
    if ((isCfBlock(html) || (!detailLike && !String(html).includes('work-card'))) && isCatalogUrl(url)) {
        const rsc = await getRsc(url);
        if (rsc && rsc.includes('work-card')) return rsc;
    }
    return html;
}

async function getDetailHtml(url) {
    return getHtml(url, url);
}

function captureVideoKey(setCookie) {
    for (const raw of toArray(setCookie)) {
        const pair = String(raw).split(';')[0].trim();
        if (/^jav_verse_video_key=/i.test(pair)) videoKeyCookie = pair;
    }
}

async function postGuestJson(path, body, referer = `${site}/`) {
    const url = site + path;
    const headers = mergeCookieHeader(baseHeaders(referer));
    headers['Content-Type'] = 'application/json';
    headers.Accept = 'application/json, text/plain, */*';
    headers.Origin = site;
    try {
        const r = await req({
            method: 'POST',
            url,
            headers,
            data: body,
            timeout: 30000,
            validateStatus: () => true,
            responseType: 'text',
        });
        captureVideoKey(r.headers['set-cookie']);
        let data = r.data;
        if (typeof data === 'string') {
            const trimmed = data.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try { data = JSON.parse(trimmed); } catch { data = { text: data.slice(0, 400) }; }
            } else {
                data = trimmed;
            }
        }
        return { status: r.status, data };
    } catch (e) {
        return { status: e.response?.status || 0, data: e.response?.data || { error: e.message } };
    }
}

async function postJsonOnce(path, body, referer) {
    const url = site + path;
    const headers = authHeaders(referer);
    headers['Content-Type'] = 'application/json';
    headers.Accept = 'application/json, text/plain, */*';
    headers.Origin = site;
    const r = await req({
        method: 'POST',
        url,
        headers,
        data: body,
        timeout: 30000,
        validateStatus: () => true,
        responseType: 'text',
    });
    captureVideoKey(r.headers['set-cookie']);
    let data = r.data;
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try { data = JSON.parse(trimmed); } catch { data = { text: data.slice(0, 400) }; }
        } else {
            data = trimmed;
        }
    }
    return { status: r.status, data };
}

async function postJson(path, body, referer = `${site}/`) {
    try {
        let r = await postJsonOnce(path, body, referer);
        if (isVideoAuthError(r.data, r.status)) {
            session = null;
            await ensureSession(true);
            r = await postJsonOnce(path, body, referer);
        }
        return r;
    } catch (e) {
        return { status: e.response?.status || 0, data: e.response?.data || { error: e.message } };
    }
}

function isCloudflarePayload(data) {
    const s = typeof data === 'string' ? data : JSON.stringify(data || '');
    return s.includes('Just a moment') || s.includes('cf-browser-verification');
}

/* --------------------------------------------------------------------------
 *  登录(Supabase Auth)
 * ------------------------------------------------------------------------ */
function nowSec() {
    return Math.floor(Date.now() / 1000);
}

function b64encode(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
}

function b64decode(str) {
    try {
        if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('utf8');
        return decodeURIComponent(escape(atob(str)));
    } catch (e) {
        return '';
    }
}

function makeSession(d) {
    const now = nowSec();
    const expiresIn = parseInt(d.expires_in, 10) || 3600;
    return {
        access_token: d.access_token || '',
        refresh_token: d.refresh_token || (session && session.refresh_token) || '',
        token_type: d.token_type || 'bearer',
        expires_in: expiresIn,
        expires_at: parseInt(d.expires_at, 10) || now + expiresIn,
        user: d.user || (session && session.user) || null,
    };
}

// 把登录态拼成站点认的 Supabase Cookie(@supabase/ssr 格式,超长自动分块)
function buildSupabaseCookie(s) {
    const payload = {
        access_token: s.access_token,
        token_type: s.token_type || 'bearer',
        expires_in: s.expires_in || 3600,
        expires_at: s.expires_at,
        refresh_token: s.refresh_token,
    };
    if (s.user) payload.user = s.user;
    const val = `base64-${b64encode(JSON.stringify(payload))}`;
    const MAX = 3180;
    if (val.length <= MAX) return `${SB_COOKIE}=${val}`;
    const out = [];
    const n = Math.ceil(val.length / MAX);
    for (let i = 0; i < n; i++) out.push(`${SB_COOKIE}.${i}=${val.slice(i * MAX, (i + 1) * MAX)}`);
    return out.join('; ');
}

// 从用户贴的 Cookie 里反解出登录态(支持分块写法)
function parseSessionFromCookie(raw) {
    const str = String(raw || '');
    if (!str || str.indexOf(SB_COOKIE) < 0) return null;
    let val = '';
    const re = new RegExp(`${SB_COOKIE}(?:\\.(\\d+))?=([^;\\s]+)`, 'g');
    const chunks = [];
    let m;
    while ((m = re.exec(str))) {
        if (m[1] === undefined) {
            val = m[2];
            chunks.length = 0;
            break;
        }
        chunks[parseInt(m[1], 10)] = m[2];
    }
    if (!val && chunks.length) val = chunks.filter(Boolean).join('');
    if (!val) return null;
    const body = val.startsWith('base64-') ? b64decode(val.slice(7)) : val;
    let data;
    try {
        data = JSON.parse(body);
    } catch (e) {
        return null;
    }
    if (!data || !data.access_token) return null;
    return makeSession(data);
}

// 直接贴整段登录态 JSON(从浏览器 Local Storage 里复制的那串)也能认
function parseSessionAny(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (s.startsWith('base64-')) {
        try {
            const d = JSON.parse(b64decode(s.slice(7)));
            if (d && (d.access_token || d.refresh_token)) return makeSession(d);
        } catch (e) {
            /* fall through */
        }
    }
    if (s.charAt(0) === '{') {
        try {
            const d = JSON.parse(s);
            if (d && (d.access_token || d.refresh_token)) return makeSession(d);
        } catch (e) {
            /* 不是完整 JSON,继续按 cookie 解析 */
        }
    }
    return parseSessionFromCookie(s);
}

function authErrText(d) {
    const code = String((d && (d.error_code || d.code)) || '');
    const msg = String((d && (d.msg || d.error_description || d.message || d.error)) || '');
    const all = `${code} ${msg}`;
    if (/captcha/i.test(all)) return '站点登录带人机验证,后台请求过不去,请改用 refreshToken 或 cookie 方式';
    if (/invalid_credentials/i.test(all)) return '账号或密码不正确';
    if (/email_not_confirmed/i.test(all)) return '邮箱还没验证,先去邮箱点确认链接';
    if (/Refresh token is not valid|invalid_grant|refresh_token_already_used/i.test(all)) {
        return '登录态已失效,请在 ext 或源码 cfg 里更新 refreshToken(浏览器 Local Storage 重新复制)';
    }
    return msg || '登录失败';
}

function extractRefreshToken(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('base64-') || s.charAt(0) === '{') {
        const parsed = parseSessionAny(s);
        return (parsed && parsed.refresh_token) || '';
    }
    return s;
}

function sessionLive() {
    return !!(session && session.access_token && (session.expires_at || 0) - 60 > nowSec());
}

function isVideoAuthError(data, status) {
    if (status === 401) return true;
    const s = typeof data === 'string' ? data : JSON.stringify(data || {});
    return /auth_required|登录已过期|Unauthorized/i.test(s);
}

async function hydrateAuthFromJar() {
    try {
        await req.loadCookies();
        const jarStr = await req.getCookieJar().getCookieString(`${site}/`);
        if (!jarStr || !jarStr.includes(SB_COOKIE)) return;
        if (!cfg.cookie) cfg.cookie = jarStr;
        const fromJar = parseSessionAny(jarStr);
        if (fromJar && fromJar.access_token) session = fromJar;
    } catch {
        /* ignore */
    }
}

// 账号密码登录(站点开了人机验证时会失败,返回原因)
async function loginByPassword() {
    if (!cfg.email || !cfg.password) return null;
    const body = { email: cfg.email, password: cfg.password };
    if (cfg.captchaToken) body.gotrue_meta_security = { captcha_token: cfg.captchaToken };
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    const r = await httpJson(`${SB_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers, body });
    if (r.status >= 200 && r.status < 300 && r.data && r.data.access_token) {
        session = makeSession(r.data);
        authMsg = '登录成功';
        return session;
    }
    authMsg = authErrText(r.data);
    return null;
}

// 用 refreshToken 换新登录态(这条不需要人机验证,可长期自动续)
async function refreshSession() {
    let rt = extractRefreshToken(cfg.refreshToken) || (session && session.refresh_token) || '';
    if (!rt) return null;
    cfg.refreshToken = rt;
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    const r = await httpJson(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers,
        body: { refresh_token: rt },
    });
    if (r.status >= 200 && r.status < 300 && r.data && r.data.access_token) {
        session = makeSession(r.data);
        cfg.refreshToken = session.refresh_token || rt;
        // Supabase 是轮换制:旧 refreshToken 换完立即作废,必须落盘,否则重启就掉登录
        persistRefreshToken(session.refresh_token);
        authMsg = '登录成功';
        refreshFailAt = 0;
        return session;
    }
    refreshFailAt = Date.now();
    authMsg = authErrText(r.data);
    session = null;
    return null;
}

let authBusy = null;
async function ensureSession(force) {
    if (!force && sessionLive()) return session;
    if (authBusy) return authBusy;
    authBusy = (async () => {
        try {
            await hydrateAuthFromJar();
            if (!session && cfg.cookie) {
                const fromCookie = parseSessionAny(cfg.cookie);
                if (fromCookie) session = fromCookie;
            }
            if (!session && cfg.accessToken) {
                session = makeSession({
                    access_token: cfg.accessToken,
                    expires_in: 3600,
                    refresh_token: extractRefreshToken(cfg.refreshToken) || cfg.refreshToken,
                });
            }
            const wantRefresh = force || !sessionLive();
            if (wantRefresh && (extractRefreshToken(cfg.refreshToken) || (session && session.refresh_token)) && Date.now() - refreshFailAt > 15000) {
                const s = await refreshSession();
                if (s) return s;
            } else if (sessionLive()) {
                return session;
            }
            if (cfg.email && cfg.password) {
                const s = await loginByPassword();
                if (s) return s;
            }
            return sessionLive() ? session : null;
        } finally {
            authBusy = null;
        }
    })();
    return authBusy;
}

// 是否具备播放权限(有登录来源就算,具体由站点接口判定)
function hasAuth() {
    return !!(cfg.cookie || cfg.accessToken || cfg.refreshToken || (cfg.email && cfg.password));
}

function mergeCookieHeader(h) {
    // 按 cookie 名去重(后来的覆盖先来的),避免同一份 sb-xxx-auth-token
    // 在同一个请求头里出现好几次,把 Supabase 的分块 cookie 解析搞乱
    const bag = new Map();
    const push = (str) => {
        for (const part of String(str || '').split(';')) {
            const pair = part.trim();
            if (!pair) continue;
            const i = pair.indexOf('=');
            if (i > 0) bag.set(pair.slice(0, i), pair);
        }
    };
    push(cfg.cookie);
    push(browseCookie);
    push(videoKeyCookie);
    if (sessionLive()) push(buildSupabaseCookie(session));
    const built = Array.from(bag.values()).join('; ');
    if (built) h.Cookie = h.Cookie ? `${built}; ${h.Cookie}` : built;
    return h;
}

function authHeaders(referer) {
    const h = baseHeaders(referer);
    if (sessionLive()) h.Authorization = `Bearer ${session.access_token}`;
    return mergeCookieHeader(h);
}

/* --------------------------------------------------------------------------
 *  RSC(Next.js App Router)流式数据 → 纯文本
 *  页面里 self.__next_f.push([1,"..."]) 里塞的是转义过的 JSON 字符串,
 *  还原出来之后所有字段都能用普通正则捞。
 * ------------------------------------------------------------------------ */
function flightText(html) {
    const src = String(html || '');
    const out = [];
    const re = /self\.__next_f\.push\(\[\s*\d+\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g;
    let m;
    while ((m = re.exec(src))) {
        try {
            out.push(JSON.parse(`"${m[1]}"`));
        } catch (e) {
            out.push(
                m[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\\\/g, '\\')
            );
        }
    }
    if (out.length) return out.join('\n');
    if (src.includes('work-card') && src.includes('"workId":')) return src;
    return '';
}

/* --------------------------------------------------------------------------
 *  列表解析
 * ------------------------------------------------------------------------ */
function pickTitle(el) {
    const t = el.find('h3').text().trim();
    if (t) return t;
    return el.find('.ready-who').text().trim();
}

function parseByHtml(html) {
    const $ = load(String(html || ''));
    const list = [];
    $('a.work-card').each((_, node) => {
        const el = $(node);
        const href = el.attr('href') || '';
        const m = href.match(/\/work\/(\d+)/);
        if (!m) return;
        const plate = el.find('.work-card-code .code-plate').first();
        const code =
            plate.attr('aria-label') ||
            `${el.find('.code-plate-prefix').first().text().trim()}${el.find('.code-plate-number').first().text().trim()}`;
        const who = el.find('.ready-who').first().text().trim();
        const date = el.find('.work-card-bottom span').first().text().trim();
        const ready = el.find('.is-ready').length > 0;
        const remarks = [who, date, ready ? '有资源' : ''].filter(Boolean).join(' · ');
        const head = pickTitle(el);
        const name = head ? (code && !head.includes(code) ? `${code} ${head}` : head) : code || `作品 ${m[1]}`;
        list.push({
            vod_id: `/work/${m[1]}`,
            vod_name: name,
            vod_pic: el.find('img').first().attr('src') || '',
            vod_remarks: remarks,
        });
    });
    return list;
}

function parseByFlight(html) {
    const text = flightText(html);
    if (!text) return [];
    const list = [];
    const re = /"className":"work-card[^"]*","workId":(\d+),"cover":"([^"]*)"/g;
    const marks = [];
    let m;
    while ((m = re.exec(text))) marks.push({ at: m.index, id: m[1], pic: m[2] });
    marks.forEach((mk, i) => {
        const seg = text.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : mk.at + 4000);
        const code = (seg.match(/"code":"([^"]*)"/) || [])[1] || '';
        const title = (seg.match(/"h3",null,\{[^{}]*"children":"((?:[^"\\]|\\.)*)"/) || seg.match(/"ready-lead-title"[^}]*"children":"((?:[^"\\]|\\.)*)"/) || [])[1] || '';
        const date = (seg.match(/"work-card-bottom","children":\[\["\$","span",null,\{"children":"([^"]*)"/) || [])[1] || '';
        list.push({
            vod_id: `/work/${mk.id}`,
            vod_name: title || code || `作品 ${mk.id}`,
            vod_pic: mk.pic || '',
            vod_remarks: date,
        });
    });
    return list;
}

function parseWorks(html) {
    const byHtml = parseByHtml(html);
    return byHtml.length ? byHtml : parseByFlight(html);
}

function extractWorkMeta(html, workIdHint = '') {
    const flight = flightText(html);
    const $ = load(html || '');
    const patterns = [
        /"work":\{"id":(\d+),"code":"([^"]*)","title":"((?:[^"\\]|\\.)*)","cover":"([^"]*)"/,
        /"workId":(\d+)[\s\S]{0,400}?"code":"([^"]*)"/,
    ];
    for (const re of patterns) {
        const m = flight.match(re);
        if (m) {
            return { workId: m[1], code: m[2], title: m[3] || '', cover: m[4] || '' };
        }
    }
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const parts = ogTitle.split(' · ').map((s) => s.trim()).filter((s) => s && s !== 'JAV Verse');
    const id = workIdHint || (String(html).match(/\/work\/(\d+)/) || [])[1] || '';
    return {
        workId: id,
        code: parts[0] || '',
        title: parts.length > 1 ? parts.slice(1).join(' · ') : '',
        cover: $('meta[property="og:image"]').attr('content') || '',
    };
}

async function lookupCodeByWorkId(workId) {
    if (!workId) return '';
    const pages = [`${site}/works`, `${site}/discover`];
    for (const pageUrl of pages) {
        const html = await getHtml(pageUrl);
        const text = flightText(html);
        const re = new RegExp(`"workId":${workId}[\\s\\S]{0,800}?"code":"([^"]*)"`);
        const hit = text.match(re);
        if (hit?.[1]) return hit[1];
    }
    return '';
}

// 分页:优先看「下一页」链接里的 page=N,退而求其次看页码列表里的最大页码
function parsePageInfo(html, page) {
    const text = flightText(html) || String(html || '');
    const pages = text.match(/"pages":(\d+)/);
    const hasNext = /"hasNext":true/.test(text);
    if (pages || hasNext) {
        let pagecount = pages ? parseInt(pages[1], 10) : page + 1;
        // 发现页总页上万,手机端按页码铺按钮会卡死,有下一页就只报当前+1
        if (!pagecount || pagecount > 200) pagecount = hasNext ? page + 1 : Math.min(pagecount || page, 200);
        return { page, pagecount: pagecount || page, limit: 48, total: (pagecount || page) * 48 };
    }
    const $ = load(String(html || ''));
    const box = $('.catalog-pagination').first();
    let pagecount = 0;
    box.find('a[href*="page="]').each((_, node) => {
        const href = $(node).attr('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) pagecount = Math.max(pagecount, parseInt(m[1], 10));
    });
    return { page, pagecount: pagecount > 0 ? pagecount : page, limit: 0, total: 0 };
}

/* --------------------------------------------------------------------------
 *  目录页(女优墙 / 片商 / 类别)
 * ------------------------------------------------------------------------ */
function parseActressWall(html) {
    const $ = load(String(html || ''));
    const out = [];
    $('a.portrait-tile').each((_, node) => {
        const el = $(node);
        const m = (el.attr('href') || '').match(/\/actress\/(\d+)/);
        if (!m) return;
        const name = el.find('.sr-only').first().text().trim() || el.attr('title') || `女优 ${m[1]}`;
        const cnt = el.find('.directory-count').first().text().replace(/\s+/g, '').trim();
        out.push({ type_id: `/actress/${m[1]}`, type_name: cnt ? `${name} ${cnt}` : name });
    });
    return out;
}

function parseDirectory(html) {
    const $ = load(String(html || ''));
    const out = [];
    $('a.directory-row').each((_, node) => {
        const el = $(node);
        const href = el.attr('href') || '';
        if (!/\/(genre|maker|label|series|code|actress)\//.test(href)) return;
        const name = el.find('.directory-name').first().text().trim() || href;
        const cnt = el.find('.directory-count').first().text().replace(/\s+/g, '').trim();
        out.push({ type_id: href, type_name: cnt ? `${name} ${cnt}` : name });
    });
    return out;
}

/* --------------------------------------------------------------------------
 *  详情资料:从 RSC 流里按字段名切块
 * ------------------------------------------------------------------------ */
function sliceAfter(text, label, stopLabel, len = 3000) {
    const i = text.indexOf(`"children":"${label}"`);
    if (i < 0) return '';
    if (stopLabel) {
        const j = text.indexOf(`"children":"${stopLabel}"`, i + 10);
        if (j > i) return text.slice(i, j);
    }
    return text.slice(i, i + len);
}

function linksOf(block, kind) {
    const out = [];
    const seen = new Set();
    // 链接里可能带 lang 等额外属性,所以 href 与 children 之间允许夹任意短片段
    const re = new RegExp(`/${kind}/([A-Za-z0-9_-]+)"[^}]{0,200}?"children":"((?:[^"\\\\]|\\\\.)*)"`, 'g');
    let m;
    while ((m = re.exec(block))) {
        const name = m[2];
        if (!name || name === '$undefined' || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
    }
    return out;
}

function plainDd(block) {
    const m = block.match(/"dd",null,\{"children":"((?:[^"\\]|\\.)*)"/);
    return m ? m[1] : '';
}

/* --------------------------------------------------------------------------
 *  播放接口
 * ------------------------------------------------------------------------ */
// 档位列表(prepare):返回线路1 / 线路2 各有哪些清晰度
async function preparePlay(workId, code, referer = `${site}/`) {
    const r = await postJson('/api/video/prepare', {
        workId: parseInt(workId, 10) || workId,
        code,
        includeLine2: true,
    }, referer);
    if (r.status >= 200 && r.status < 300 && r.data) {
        return {
            variants: Array.isArray(r.data.variants) ? r.data.variants : [],
            line2Variants: Array.isArray(r.data.line2Variants) ? r.data.line2Variants : [],
            err: '',
        };
    }
    if (isCloudflarePayload(r.data)) {
        return { variants: [], line2Variants: [], err: '播放接口被 Cloudflare 拦截,请在 ext 里补充浏览器 Cookie(含 cf_clearance)' };
    }
    const err = (r.data && (r.data.error || r.data.msg || r.data.message)) || `prepare ${r.status}`;
    return { variants: [], line2Variants: [], err };
}

function pickVariant(list, want) {
    if (!list || !list.length) return undefined;
    if (!want) return list[0];
    const hit = list.find((v) => String(v) === String(want));
    return hit || list[0];
}

// 解析片源:线路1 = sessions(m3u8) 线路2 = line2(直链)
async function resolvePlay(workId, code, variant, opts = {}) {
    const lines = [];
    const notes = [];
    if (!workId) return { lines, notes };
    if (!session || !session.access_token) {
        await ensureSession();
    }
    if (!session || !session.access_token) {
        notes.push(authMsg || '本站片源需登录后观看,请在插件配置里填 refreshToken(推荐)或账号密码');
        return { lines, notes };
    }

    const pageRef = `${site}/work/${workId}`;
    const prep = await preparePlay(workId, code, pageRef);
    if (prep.err) notes.push(String(prep.err));
    const v1 = pickVariant(prep.variants, variant);
    const v2 = pickVariant(prep.line2Variants, variant);

    const wid = parseInt(workId, 10) || workId;

    if (!opts.skipLine2) {
        try {
            const s2 = await postGuestJson('/api/video/line2', { workId: wid, code }, pageRef);
            const fileUrl = pickLine2File(s2.data);
            if (s2.status >= 200 && s2.status < 300 && fileUrl) {
                const tag = s2.data.variant || v2;
                lines.push({ name: `线路2${tag ? ` ${tag}` : ''}`, url: abs(fileUrl) });
            }
        } catch {
            /* line2 optional */
        }
    }

    const variantTag = v1 || variant || 'standard';
    const body1 = { workId: wid, code, variant: variantTag };
    try {
        const s = await postJson('/api/video/sessions', body1, pageRef);
        const playlistUrl = pickPlaylist(s.data);
        if (isCloudflarePayload(s.data)) {
            notes.push('播放接口被 Cloudflare 拦截,请在 ext 里补充浏览器 Cookie(含 cf_clearance)');
        } else if (s.status === 401) {
            notes.push(authMsg || (s.data && s.data.error) || '请先登录后再观看视频');
        } else if (s.status >= 200 && s.status < 300 && playlistUrl) {
            const variants = Array.isArray(s.data.variants) && s.data.variants.length ? s.data.variants : prep.variants;
            const tag = s.data.variant || v1;
            lines.push({ name: `线路1${tag ? ` ${tag}` : ''}`, url: abs(playlistUrl) });
            variants.filter((v) => String(v) !== String(tag)).forEach((v) => {
                lines.push({ name: `线路1 ${v}`, url: `jv://${workId}|${encodeURIComponent(code || '')}|1|${encodeURIComponent(v)}` });
            });
        } else {
            const hint = (s.data && (s.data.error || s.data.msg || s.data.message)) || '';
            notes.push(hint || `线路 1 片源暂时无法获取(${s.status})`);
        }
    } catch (e) {
        notes.push('线路 1 请求失败');
    }

    return { lines, notes };
}

/* --------------------------------------------------------------------------
 *  接口实现
 * ------------------------------------------------------------------------ */
async function init(inReq) {
    const ext = (inReq && inReq.body && inReq.body.ext) || {};
    cfg.cookie = ext.cookie || ext.cookieJavverse || cfg.cookie || '';
    cfg.email = ext.email || ext.username || cfg.email || '';
    cfg.password = ext.password || cfg.password || '';
    cfg.captchaToken = ext.captchaToken || cfg.captchaToken || '';
    // 优先级:ext 里手填的 > 上次自动轮换后落盘的 > 源码兜底(源码那条基本早已作废)
    cfg.refreshToken = ext.refreshToken || ext.refresh_token || persistedRT || cfg.refreshToken || '';
    cfg.accessToken = ext.accessToken || ext.access_token || cfg.accessToken || '';

    // refreshToken 也可能是整段登录态 JSON 或 Local Storage 的 base64- 串(只提取 refresh, 避免过期 access 被当成已登录)
    if (cfg.refreshToken) {
        const trimmed = cfg.refreshToken.trim();
        if (trimmed.charAt(0) === '{' || trimmed.startsWith('base64-')) {
            const rt = extractRefreshToken(trimmed);
            if (rt) cfg.refreshToken = rt;
        }
    }
    // 贴的是 cookie 的话,里面就带着登录态,直接反解出来
    if (!session && cfg.cookie) {
        const s = parseSessionAny(cfg.cookie);
        if (s) session = s;
    }
    // 首次初始化本来就还没有内存态,非强制刷新也一定会去换一次;
    // 用非强制是为了避免"每次 init 都白白轮换一次 token"
    if (hasAuth()) await ensureSession();

    return {
        cookie: cfg.cookie,
        email: cfg.email,
        // 方便调用方自查登录是否真的成功
        login: sessionLive(),
        loginMsg: authMsg || (hasAuth() ? (sessionLive() ? '' : '登录态无效,请更新 refreshToken') : '未配置登录信息'),
        user: (session && session.user && (session.user.email || session.user.id)) || '',
    };
}

async function home(inReq) {
    const ext = (inReq && inReq.body && inReq.body.ext) || {};
    if (ext.cookie && !cfg.cookie) cfg.cookie = ext.cookie;

    const classList = [
        { type_id: '/works', type_name: '推荐作品' },
        { type_id: '/discover', type_name: '最新发售' },
        { type_id: '/discover?view=upcoming', type_name: '即将发售' },
        { type_id: '/discover?sort=oldest', type_name: '最早发售' },
        { type_id: '/discover?year=2026', type_name: '2026 年' },
        { type_id: '/discover?year=2025', type_name: '2025 年' },
        { type_id: '/discover?year=2024', type_name: '2024 年' },
        { type_id: '/genre/4025', type_name: '单体作品' },
        { type_id: '/genre/5001', type_name: '中出' },
        { type_id: '/genre/1039', type_name: '人妻・主妇' },
        { type_id: '/genre/1014', type_name: '熟女' },
        { type_id: '/genre/4024', type_name: '素人' },
        { type_id: '/genre/2001', type_name: '巨乳' },
        { type_id: '/genre/4111', type_name: 'NTR' },
        { type_id: '/genre/6793', type_name: 'VR 专用' },
        { type_id: '/genre/6533', type_name: '高清' },
        { type_id: '/genre/6012', type_name: '4 小时以上' },
    ];

    // 顺带把「热门女优 / 热门片商 / 热门类别」拉成分类,日常基本够用
    const [a, m, g] = await Promise.all([
        getHtml(`${site}/actresses`).catch(() => ''),
        getHtml(`${site}/makers`).catch(() => ''),
        getHtml(`${site}/genres`).catch(() => ''),
    ]);
    const actresses = parseActressWall(a).slice(0, 10);
    const makers = parseDirectory(m).slice(0, 8);
    const genres = parseDirectory(g).slice(0, 12);
    if (actresses.length) classList.push(...actresses);
    if (makers.length) classList.push(...makers);
    if (genres.length) classList.push(...genres);

    const yearFilter = [{ n: '全部', v: '' }];
    for (let y = 2027; y >= 2002; y--) yearFilter.push({ n: `${y}`, v: `${y}` });

    return {
        class: classList,
        filters: {
            '/discover': [
                { key: 'sort', name: '排序', value: [{ n: '新 → 旧', v: '' }, { n: '旧 → 新', v: 'oldest' }] },
                { key: 'view', name: '档期', value: [{ n: '已发售', v: '' }, { n: '未来档期', v: 'upcoming' }] },
                { key: 'year', name: '年份', value: yearFilter },
            ],
            '/works': [],
        },
    };
}

// 把 type_id + 页码 + 筛选拼成真实 URL
function buildListUrl(tid, page, filters) {
    let base = String(tid || '/discover').trim() || '/discover';
    if (!base.startsWith('/')) base = `/${base}`;
    const url = new URL(base, site);
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    const f = filters || {};
    Object.keys(f).forEach((k) => {
        const v = f[k];
        if (v === undefined || v === null || v === '') url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
    });
    return url.href;
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const tid = body.id || body.tid;
    const filters = body.filters || {};
    const url = buildListUrl(tid, page, filters);
    const html = await getHtml(url);
    const list = parseWorks(html);
    const info = parsePageInfo(html, page);
    const limit = list.length || info.limit || 0;
    const total = list.length ? Math.max(list.length, (info.pagecount || page) * list.length) : 0;
    return { page: info.page, pagecount: info.pagecount, limit, total, list };
}

async function detail(inReq) {
    let id = String((inReq && inReq.body && inReq.body.id) || '').trim();
    if (!id) return { list: [] };
    if (/^\d+$/.test(id)) id = `/work/${id}`;
    const url = abs(id);

    const html = await getDetailHtml(url);
    const $ = load(html);
    const flight = flightText(html);

    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';

    const workHint = (id.match(/\/work\/(\d+)/) || [])[1] || '';
    const meta = extractWorkMeta(html, workHint);
    const workId = meta.workId || workHint;
    let srcCode = meta.code || '';
    const rawTitle = meta.title || '';
    const cover = meta.cover || ogImage || '';

    const parts = ogTitle.split(' · ').map((s) => s.trim()).filter(Boolean);
    const display = parts.filter((s) => s !== 'JAV Verse');
    const codeText = display.length > 1 ? display[0] : (display[0] || '');
    const titleText = rawTitle || (display.length > 1 ? display.slice(1).join(' · ') : display[0] || '');
    if (!srcCode) srcCode = codeText;
    if (!srcCode && workId) srcCode = await lookupCodeByWorkId(workId);

    // 资料区
    const facts = sliceAfter(flight, '作品资料', null, 6000);
    const actresses = linksOf(sliceAfter(flight, '出演者', '时长'), 'actress');
    const genres = linksOf(sliceAfter(flight, '类别', '番号系列'), 'genre');
    const maker = linksOf(sliceAfter(flight, '制作片商', '厂牌'), 'maker')[0] || '';
    const label = linksOf(sliceAfter(flight, '厂牌', '系列'), 'label')[0] || '';
    const series = plainDd(sliceAfter(flight, '系列', '类别'));
    const releaseDate = (facts.match(/"dd",null,\{"children":"(\d{4}-\d{2}-\d{2})"\}/) || [])[1] || '';
    const duration = (facts.match(/"dd",null,\{"children":"([^"]*分钟)"\}/) || [])[1] || '';
    const director = linksOf(sliceAfter(flight, '导演', '制作片商'), 'director')[0] || '';
    const sourceNo = plainDd(sliceAfter(flight, '来源编号', null, 400)) || srcCode;

    // 社区评分(顺手当热度用:站上没有播放量统计)
    const scoreAt = flight.indexOf('"detail-score"');
    const scoreBlock = scoreAt >= 0 ? flight.slice(scoreAt, scoreAt + 900) : '';
    const scoreM = scoreBlock.match(/"\$","strong",null,\{"children":"([\d.]+)"\}/);
    const score = scoreM ? scoreM[1] : '';
    const ratingCount = parseInt((scoreBlock.match(/(\d+)\s*人评分/) || [])[1] || '0', 10);
    const scoreNote = ratingCount > 0 ? `${ratingCount} 人评分` : '';

    // 剧照
    const stills = [];
    const sm = flight.match(/"urls":\[((?:"[^"]*",?)+)\]/);
    if (sm) {
        const re = /"([^"]+)"/g;
        let x;
        while ((x = re.exec(sm[1]))) stills.push(x[1]);
    }

    // 片源:已登录就当场解析出真实地址,没登录就留 jv:// 占位,点播时再解析
    const playCode = srcCode || codeText || '';
    const notes = [];
    let canPlay = false;
    if (hasAuth() && workId) {
        await ensureSession();
        const prep = await preparePlay(workId, playCode, `${site}/work/${workId}`);
        if (prep.err) notes.push(prep.err);
        else if (prep.variants.length || prep.line2Variants.length) canPlay = true;
    }
    if (hasAuth() && (!session || !session.access_token) && authMsg) notes.push(authMsg);
    const playUrl = workId
        ? `线路1$jv://${workId}|${encodeURIComponent(playCode)}|1#线路2$jv://${workId}|${encodeURIComponent(playCode)}|2`
        : '';
    const playFrom = playUrl ? 'javverse' : '';
    const contentLines = [];
    if (ogDesc) contentLines.push(ogDesc);
    contentLines.push(`番号:${codeText || srcCode || '—'}`);
    if (releaseDate) contentLines.push(`发售日期:${releaseDate}`);
    if (duration) contentLines.push(`时长:${duration}`);
    if (score) contentLines.push(`社区评分:${score}${scoreNote ? `(${scoreNote})` : ''}`);
    if (maker) contentLines.push(`片商:${maker}${label && label !== maker ? ` / ${label}` : ''}`);
    if (director) contentLines.push(`导演:${director}`);
    if (series && series !== '待补充') contentLines.push(`系列:${series}`);
    if (genres.length) contentLines.push(`类别:${genres.join('、')}`);
    if (actresses.length) contentLines.push(`出演:${actresses.join('、')}`);
    if (stills.length) contentLines.push(`剧照:${stills.length} 张`);
    if (notes.length) contentLines.push(`提示:${notes.join(';')}`);
    contentLines.push(`来源:${url}`);

    return {
        list: [
            {
                vod_id: id.startsWith('/') ? id : `/work/${workId}`,
                vod_name: codeText ? `${codeText} ${titleText}`.trim() : titleText,
                vod_pic: cover,
                vod_content: contentLines.join('\n'),
                vod_year: (releaseDate || '').slice(0, 4),
                vod_area: '日本',
                vod_director: director,
                vod_actor: actresses.join(','),
                // 站上没有播放量,这里用社区评分人数当热度
                vod_hits: ratingCount > 0 ? String(ratingCount) : '',
                vod_remarks: canPlay ? (codeText || '有资源') : (hasAuth() ? '片源暂不可用' : '需登录观看'),
                vod_play_from: playFrom,
                vod_play_url: playUrl,
                vod_pic_screenshot: stills.join('$$$'),
            },
        ],
    };
}

async function play(inReq) {
    const body = (inReq && inReq.body) || {};
    let url = String(body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();

    let pageRef = `${site}/`;
    const needResolve = url.startsWith('jv://') || /\/api\/video\/media\/stream\?ticket=/.test(url);

    if (needResolve) {
        await ensureBrowseGate();
        // 不要每次播放都强制换 token:Supabase 轮换制,强制刷新等于每次都作废旧 token,
        // 一旦落盘失败或并发就会把登录态烧掉。按需刷新就够了。
        await ensureSession();
        let workId = '';
        let code = '';
        let variant = '';
        if (url.startsWith('jv://')) {
            const seg = url.slice(5).split('|');
            workId = seg[0];
            code = decodeURIComponent(seg[1] || '');
            // seg[2] 是线路号。两条线路都先走线路2 直链(MP4 对电视端兼容最好),
            // 拿不到再回落线路1 的 m3u8
            variant = seg[3] ? decodeURIComponent(seg[3]) : '';
        } else {
            const m = url.match(/[?&]ticket=([^&]+)/);
            if (m) {
                try {
                    const payload = JSON.parse(Buffer.from(m[1].split('.')[0], 'base64url').toString('utf8'));
                    workId = String(payload.wid || payload.workId || '');
                } catch { /* ignore */ }
            }
        }
        if (!code && workId) code = await lookupCodeByWorkId(workId);
        pageRef = workId ? `${site}/work/${workId}` : `${site}/`;
        videoKeyCookie = '';
        const wid = parseInt(workId, 10) || workId;
        const tryLine2 = async () => {
            const body2 = variant ? { workId: wid, code, variant } : { workId: wid, code };
            const s = await postGuestJson('/api/video/line2', body2, pageRef);
            const fileUrl = pickLine2File(s.data);
            if (s.status >= 200 && s.status < 300 && fileUrl) return abs(fileUrl);
            return '';
        };

        url = await tryLine2();
        if (!url) {
            // 线路 2 拿不到就回落线路 1。原来这里失败会把 jv:// 伪协议原样
            // 丢给播放器 —— 播放器不认识这个协议,必然黑屏/报错。
            const r = await resolvePlay(workId, code, variant || null, { skipLine2: true });
            const hit = r.lines.find((l) => l.url && !String(l.url).startsWith('jv://'));
            if (hit) url = hit.url;
        }
    }

    if (!url || url.startsWith('jv://')) {
        return { parse: 0, url: url || '', header: { 'User-Agent': UA, Referer: pageRef } };
    }

    const header = authHeaders(pageRef);
    const fullUrl = abs(url);
    if (needsStreamProxy(fullUrl)) {
        const token = storePlayAuth(header);
        const proxied = proxyStreamPath(inReq, fullUrl, pageRef, token);
        if (proxied) {
            return { parse: 0, url: proxied, header: { 'User-Agent': UA, Referer: pageRef } };
        }
    }
    return { parse: 0, url: fullUrl, header };
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    const wd = String(body.wd || body.key || '').trim();
    if (!wd) return { list: [] };
    const url = `${site}/search?q=${encodeURIComponent(wd)}&type=works`;
    const html = await getHtml(url);
    return { list: parseWorks(html) };
}

export default {
    meta: { key: 'javverse', name: '🌸JAV Verse', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy/stream', streamProxy);
    },
};
