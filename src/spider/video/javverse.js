import { load } from 'cheerio';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

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

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://javverse.com';

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

async function httpJson(url, opt = {}) {
    const method = String(opt.method || 'GET').toUpperCase();
    const headers = { ...(opt.headers || {}) };
    const config = {
        method,
        url,
        headers,
        // httpsAgent: agent,
        timeout: 30000,
        validateStatus: () => true,
        responseType: 'text',
    };
    if (method !== 'GET' && opt.body !== undefined) {
        config.data = opt.body;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    try {
        const r = await axios(config);
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
    return !s || s.includes('Just a moment') || s.includes('cf-browser-verification');
}

async function getPublicHtml(url, referer = `${site}/`) {
    try {
        const r = await axios.get(url, {
            headers: mergeCookieHeader(baseHeaders(referer)),
            // httpsAgent: agent,
            timeout: 30000,
            validateStatus: () => true,
            responseType: 'text',
        });
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

// 浏览列表/详情用游客头;带 Supabase Cookie 的 GET 容易触发 Cloudflare
async function getHtml(url, referer) {
    let html = await getPublicHtml(url, referer || `${site}/`);
    if (isCfBlock(html) && hasAuth()) {
        await ensureSession();
        try {
            const r = await axios.get(url, {
                headers: authHeaders(referer || `${site}/`),
                // httpsAgent: agent,
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
    return html;
}

async function getDetailHtml(url) {
    return getHtml(url, url);
}

function captureVideoKey(setCookie) {
    for (const raw of setCookie || []) {
        const pair = String(raw).split(';')[0].trim();
        if (pair.startsWith('jav_verse_video_key=')) {
            videoKeyCookie = pair;
            return;
        }
    }
}

async function postJson(path, body, referer = `${site}/`) {
    const url = site + path;
    const headers = authHeaders(referer);
    headers['Content-Type'] = 'application/json';
    headers.Accept = 'application/json, text/plain, */*';
    headers.Origin = site;
    try {
        const r = await axios({
            method: 'POST',
            url,
            headers,
            data: body,
            // httpsAgent: agent,
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
    if (/Refresh token is not valid|invalid_grant/i.test(all)) return '登录态已失效,重新取一份 refreshToken';
    return msg || '登录失败';
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
    let rt = cfg.refreshToken || (session && session.refresh_token);
    if (rt && String(rt).startsWith('base64-')) {
        const parsed = parseSessionAny(rt);
        if (parsed) {
            session = parsed;
            cfg.refreshToken = parsed.refresh_token;
            rt = parsed.refresh_token;
        }
    }
    if (!rt) return null;
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    const r = await httpJson(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers,
        body: { refresh_token: rt },
    });
    if (r.status >= 200 && r.status < 300 && r.data && r.data.access_token) {
        session = makeSession(r.data);
        authMsg = '登录成功';
        refreshFailAt = 0;
        return session;
    }
    refreshFailAt = Date.now();
    if (!session || !session.access_token) authMsg = authErrText(r.data);
    return null;
}

let authBusy = null;
async function ensureSession(force) {
    if (!force && session && session.access_token && session.expires_at - 90 > nowSec()) return session;
    if (authBusy) return authBusy;
    authBusy = (async () => {
        try {
            if (!session && cfg.cookie) {
                const fromCookie = parseSessionAny(cfg.cookie);
                if (fromCookie) session = fromCookie;
            }
            if (!session && cfg.accessToken) {
                session = makeSession({ access_token: cfg.accessToken, expires_in: 3600, refresh_token: cfg.refreshToken });
            }
            if ((cfg.refreshToken || (session && session.refresh_token)) && Date.now() - refreshFailAt > 60000) {
                const s = await refreshSession();
                if (s) return s;
            }
            if (cfg.email && cfg.password) return await loginByPassword();
            return session;
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
    const parts = [];
    if (cfg.cookie) parts.push(cfg.cookie);
    if (videoKeyCookie) parts.push(videoKeyCookie);
    if (session && session.access_token) parts.push(buildSupabaseCookie(session));
    if (parts.length) h.Cookie = h.Cookie ? `${parts.join('; ')}; ${h.Cookie}` : parts.join('; ');
    return h;
}

function authHeaders(referer) {
    const h = baseHeaders(referer);
    if (session && session.access_token) h.Authorization = `Bearer ${session.access_token}`;
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
    return out.join('\n');
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
    const re = /"className":"work-card","workId":(\d+),"cover":"([^"]*)"/g;
    const marks = [];
    let m;
    while ((m = re.exec(text))) marks.push({ at: m.index, id: m[1], pic: m[2] });
    marks.forEach((mk, i) => {
        const seg = text.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : mk.at + 4000);
        const code = (seg.match(/"code":"([^"]*)"/) || [])[1] || '';
        const title = (seg.match(/"h3",null,\{[^{}]*"children":"((?:[^"\\]|\\.)*)"/) || [])[1] || '';
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
async function resolvePlay(workId, code, variant) {
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
    const body1 = v1 ? { workId: wid, code, variant: v1 } : { workId: wid, code };
    try {
        const s = await postJson('/api/video/sessions', body1, pageRef);
        const playlistUrl = s.data && (s.data.playlistUrl || s.data.playlist_url || s.data.url || s.data.m3u8Url);
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

    try {
        const body2 = v2 ? { workId: wid, code, variant: v2 } : { workId: wid, code };
        const s = await postJson('/api/video/line2', body2, pageRef);
        const fileUrl = s.data && (s.data.fileUrl || s.data.file_url || s.data.url);
        if (s.status >= 200 && s.status < 300 && fileUrl) {
            const tag = s.data.variant || v2;
            lines.push({ name: `线路2${tag ? ` ${tag}` : ''}`, url: abs(fileUrl) });
        } else if (s.status !== 401) {
            notes.push((s.data && (s.data.error || s.data.msg)) || '线路 2 片源暂时无法获取');
        }
    } catch (e) {
        /* 线路 2 拿不到就算了 */
    }

    return { lines, notes };
}

/* --------------------------------------------------------------------------
 *  接口实现
 * ------------------------------------------------------------------------ */
async function init(inReq) {
    const ext = (inReq && inReq.body && inReq.body.ext) || {};
    cfg.cookie = ext.cookie || ext.cookieJavverse || cfg.cookie || '';
    cfg.email = ext.email || ext.username || cfg.email || 'liuxy01999@gmail.com';
    cfg.password = ext.password || cfg.password || '12345678';
    cfg.captchaToken = ext.captchaToken || cfg.captchaToken || '';
    cfg.refreshToken = ext.refreshToken || ext.refresh_token || cfg.refreshToken || '';
    cfg.accessToken = ext.accessToken || ext.access_token || cfg.accessToken || '';

    // refreshToken 也可能是整段登录态 JSON 或 Local Storage 的 base64- 串
    if (cfg.refreshToken) {
        const trimmed = cfg.refreshToken.trim();
        if (trimmed.charAt(0) === '{' || trimmed.startsWith('base64-')) {
            const js = parseSessionAny(trimmed);
            if (js) {
                session = js;
                cfg.refreshToken = js.refresh_token;
            }
        }
    }
    // 贴的是 cookie 的话,里面就带着登录态,直接反解出来
    if (!session && cfg.cookie) {
        const s = parseSessionAny(cfg.cookie);
        if (s) session = s;
    }
    if (hasAuth()) await ensureSession();

    return {
        cookie: cfg.cookie,
        email: cfg.email,
        // 方便调用方自查登录是否真的成功
        login: !!(session && session.access_token),
        loginMsg: authMsg || (hasAuth() ? '' : '未配置登录信息'),
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
    return { page: info.page, pagecount: info.pagecount, limit: info.limit, total: info.total, list };
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
        await ensureSession(true);
        let workId = '';
        let code = '';
        let line = 1;
        let variant = '';
        if (url.startsWith('jv://')) {
            const seg = url.slice(5).split('|');
            workId = seg[0];
            code = decodeURIComponent(seg[1] || '');
            line = parseInt(seg[2] || '1', 10) || 1;
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
        if (line === 2) {
            const wid = parseInt(workId, 10) || workId;
            const s = await postJson('/api/video/line2', variant ? { workId: wid, code, variant } : { workId: wid, code }, pageRef);
            const fileUrl = s.data && (s.data.fileUrl || s.data.file_url || s.data.url);
            if (fileUrl) url = abs(fileUrl);
        } else {
            const r = await resolvePlay(workId, code, variant || null);
            const hit = r.lines.find((l) => l.url && !String(l.url).startsWith('jv://'));
            if (hit) url = hit.url;
        }
    }

    const header = authHeaders(pageRef);
    return { parse: 0, url, header };
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
    meta: { key: 'javverse', name: '🎬JAV Verse', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
