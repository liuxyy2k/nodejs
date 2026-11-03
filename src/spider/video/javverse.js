import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
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
 *  【播放说明 · 重要】
 *  站点 GET 页面有人机校验(机房 IP 经常被挡),但播放走的是 POST 接口,
 *  游客就能取到片源:/api/video/sessions 直接返回 m3u8,不需要登录。
 *  登录只影响 /api/video/prepare(档位元数据),不影响播放。
 *
 *  【代理写法】ext.proxy 四选一:
 *    auto   本地 HTTP 代理优先 → 壳子路由 → 直连(默认,推荐)
 *    local  只用本地 HTTP 代理
 *    router 只用壳子自带路由(壳子必须能给出真实 http 地址)
 *    direct 不代理,上游地址 + header 直接交给播放器
 *
 *  为什么默认自己起 HTTP 代理:片源要带 Cookie(票和 Cookie 一对一绑定),
 *  而播放器不会替分片带 play.header。插件内置的代理服务监听一个真实
 *  HTTP 端口,播放器拿到的是普通 http:// 地址,列表和分片都在这里回源,
 *  Cookie / Range / CORS 全部由代理处理。
 *
 *  额外可填(一般不用):
 *    proxyHost  播放器访问不到壳子给的 Host 时,手动指定局域网 IP
 *    proxyPort  固定代理端口(壳子防火墙只放行特定端口时用)
 *
 *  【站点真实播放链路】
 *   POST /api/video/sessions { workId, code, variant } -> m3u8(游客可用)
 *   POST /api/video/line2    { workId, code, variant } -> 线路2 直链(站点已下线)
 *   GET  /api/video/media/stream?ticket=...            -> 列表与分片同路径
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
    // 播放代理模式:
    //   auto   本地 HTTP 代理 → 壳子路由 → 直连(默认,推荐)
    //   local  只用本地 HTTP 代理
    //   router 只用壳子自带路由(必须能给出真实 http 地址)
    //   direct 不代理,直接给上游地址 + header 让播放器自己拉
    proxy: 'auto',
    // 手动指定播放器能访问到的主机/端口(容器部署、或壳子给的 Host 不对时用)
    //   proxyHost: '192.168.1.20'   proxyPort: 39001
    proxyHost: '',
    proxyPort: 0,
    cookie: '',
    email: '',
    password: '',
    captchaToken: '',
    accessToken: '',
    refreshToken: 'base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSkZVekkxTmlJc0ltdHBaQ0k2SW1SalpUa3dabU15TFRsa1lqRXRORE01TmkwNVlqVmtMVEk1TVdRMU0ySmlNbUl3T0NJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUpvZEhSd2N6b3ZMM2wzWVhCNmIyeHBabVJyZFdWamVHdDBiR2x2TG5OMWNHRmlZWE5sTG1OdkwyRjFkR2d2ZGpFaUxDSnpkV0lpT2lJME5tWmpZekF4WmkwME9USmtMVFEyWTJRdE9ERmlOQzB4WlRCa05qVXpZakk1TVRRaUxDSmhkV1FpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWlhod0lqb3hOemt4T1RjNU9UTTNMQ0pwWVhRaU9qRTNPVEU1TnpZek16Y3NJbVZ0WVdsc0lqb2liR2wxZUhrd01UazVPVUJuYldGcGJDNWpiMjBpTENKd2FHOXVaU0k2SWlJc0ltRndjRjl0WlhSaFpHRjBZU0k2ZXlKd2NtOTJhV1JsY2lJNkltVnRZV2xzSWl3aWNISnZkbWxrWlhKeklqcGJJbVZ0WVdsc0lsMTlMQ0oxYzJWeVgyMWxkR0ZrWVhSaElqcDdJbVZ0WVdsc0lqb2liR2wxZUhrd01UazVPVUJuYldGcGJDNWpiMjBpTENKbGJXRnBiRjkyWlhKcFptbGxaQ0k2ZEhKMVpTd2ljR2h2Ym1WZmRtVnlhV1pwWldRaU9tWmhiSE5sTENKemRXSWlPaUkwTm1aall6QXhaaTAwT1RKa0xUUTJZMlF0T0RGaU5DMHhaVEJrTmpVellqSTVNVFFpZlN3aWNtOXNaU0k2SW1GMWRHaGxiblJwWTJGMFpXUWlMQ0poWVd3aU9pSmhZV3d4SWl3aVlXMXlJanBiZXlKdFpYUm9iMlFpT2lKd1lYTnpkMjl5WkNJc0luUnBiV1Z6ZEdGdGNDSTZNVGM1TVRrM05qTXpOMzFkTENKelpYTnphVzl1WDJsa0lqb2lNbUZoTWpka1lqWXRPVEl4TVMwME5EUTRMV0V5WkdFdE1UazFObU5sT0Rnek1USTNJaXdpYVhOZllXNXZibmx0YjNWeklqcG1ZV3h6WlgwLjF6Rkc0aFhYOE5fMFpDUUswVnhJN3lxLS1XV1Ztem94dzAwUGlHaHdaRlY3MFY4S2hJeF8zSnB3X1FaVEJUM1hkMnhGS0JOcUlRM05yNFhra0J6QV9RIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsImV4cGlyZXNfaW4iOjM2MDAsImV4cGlyZXNfYXQiOjE3OTE5Nzk5MzcsInJlZnJlc2hfdG9rZW4iOiJkZjd3bWJkejM1eHgiLCJ1c2VyIjp7ImlkIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZW1haWwiOiJsaXV4eTAxOTk5QGdtYWlsLmNvbSIsImVtYWlsX2NvbmZpcm1lZF9hdCI6IjIwMjYtMTAtMTFUMDY6MzY6MjYuMDIzNzA1WiIsInBob25lIjoiIiwiY29uZmlybWF0aW9uX3NlbnRfYXQiOiIyMDI2LTEwLTExVDA2OjM2OjA4LjUzMTAyNFoiLCJjb25maXJtZWRfYXQiOiIyMDI2LTEwLTExVDA2OjM2OjI2LjAyMzcwNVoiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI2LTEwLTE0VDExOjEyOjE3LjI1MTI3MDM1MloiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImxpdXh5MDE5OTlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0In0sImlkZW50aXRpZXMiOlt7ImlkZW50aXR5X2lkIjoiMDViMjYwNWEtZjUyOS00NDAxLTkzM2UtYWU5Yjc1ZjEwMTllIiwiaWQiOiI0NmZjYzAxZi00OTJkLTQ2Y2QtODFiNC0xZTBkNjUzYjI5MTQiLCJ1c2VyX2lkIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0IiwiaWRlbnRpdHlfZGF0YSI6eyJlbWFpbCI6ImxpdXh5MDE5OTlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiNDZmY2MwMWYtNDkyZC00NmNkLTgxYjQtMWUwZDY1M2IyOTE0In0sInByb3ZpZGVyIjoiZW1haWwiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI2LTEwLTExVDA2OjM2OjA4LjUxMTM3NFoiLCJjcmVhdGVkX2F0IjoiMjAyNi0xMC0xMVQwNjozNjowOC41MTE0NDNaIiwidXBkYXRlZF9hdCI6IjIwMjYtMTAtMTFUMDY6MzY6MDguNTExNDQzWiIsImVtYWlsIjoibGl1eHkwMTk5OUBnbWFpbC5jb20ifV0sImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTExVDA2OjM2OjA4LjQ2MDc5WiIsInVwZGF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjEyOjE3LjMwNTQwOVoiLCJpc19hbm9ueW1vdXMiOmZhbHNlfSwid2Vha19wYXNzd29yZCI6bnVsbH0',
};

// 运行中的登录态
let session = null; // { access_token, refresh_token, expires_at, user }
let authMsg = '';
let refreshFailAt = 0;
/** 最近一次播放的关键信息(给 /debug 用,排查播放不了时一眼看出断在哪) */
let lastPlayDebug = {};
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

/* ==========================================================================
 *  播放代理 · 本地 HTTP 服务(核心)
 *  ---------------------------------------------------------------------
 *  【为什么要换写法】
 *  上一版把播放地址拼成 `js2p://_WEB_/spider/javverse/3/proxy/stream?...`。
 *  js2p:// 是壳子内部的 RPC 协议,只有壳子自己的 JS 层认;播放器(ExoPlayer /
 *  IJK / ffmpeg)拿到这个地址只会当成无法识别的链接,直接黑屏 —— 跟片源、
 *  票、Cookie 一点关系都没有,是地址写法本身播不了。
 *
 *  【现在的写法】
 *  插件自己起一个真实的 HTTP 服务(0.0.0.0:随机端口),返回给播放器的永远是
 *  一个普通 `http://<host>:<port>/jv/<sid>/<n>`:
 *    - 播放列表在这里重写,列表里的分片地址同样指向这个 HTTP 服务
 *    - 每条播放会话单独保存 Cookie / UA / Referer,多人并发不串号
 *    - Range、HEAD、CORS、206 全部照常处理
 *    - 路径只有短编号,不带超长参数,老播放器也吃得下
 * ========================================================================== */
const LOCAL_PROXY_TTL_MS = 6 * 60 * 60 * 1000;
const LOCAL_MAX_ITEMS = 20000;
let localProxy = null; // { server, port }
let localProxyTask = null;
const localSessions = new Map(); // sid -> { headers, urls, rev, kinds, next, expires }

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Range,Content-Type,Origin,Accept',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,Content-Type',
};

function pruneLocalSessions() {
    const now = Date.now();
    for (const [k, v] of localSessions) {
        if (!v || v.expires < now) localSessions.delete(k);
    }
}

function newLocalSession(headers) {
    pruneLocalSessions();
    const sid = crypto.randomBytes(8).toString('hex');
    localSessions.set(sid, {
        headers: { ...(headers || {}) },
        urls: new Map(), // n -> 上游地址
        rev: new Map(), // 上游地址 -> n
        kinds: new Map(), // n -> 'pl' | 'seg'
        next: 1,
        expires: Date.now() + LOCAL_PROXY_TTL_MS,
    });
    return sid;
}

/**
 * 把一个上游地址登记进会话,返回短编号。
 * 同一个地址(播放器会反复请求同一分片)复用同一个编号,避免 Map 无限膨胀。
 */
function registerLocalUrl(sess, url, kind) {
    if (!sess || !url) return 0;
    const target = String(url);
    const prev = sess.rev.get(target);
    if (prev) {
        if (kind === 'pl') sess.kinds.set(prev, 'pl');
        return prev;
    }
    const n = sess.next++;
    sess.urls.set(n, target);
    sess.rev.set(target, n);
    sess.kinds.set(n, kind === 'pl' ? 'pl' : 'seg');
    if (sess.urls.size > LOCAL_MAX_ITEMS) {
        const oldest = sess.urls.keys().next().value;
        const oldUrl = sess.urls.get(oldest);
        sess.urls.delete(oldest);
        sess.rev.delete(oldUrl);
        sess.kinds.delete(oldest);
    }
    return n;
}

/** 起本地代理(只起一次),返回端口;失败返回 0 交给上层兜底 */
function ensureLocalProxy() {
    // 配置里改了固定端口 → 把旧的重开,别让新配置形同虚设
    if (localProxy && cfg.proxyPort > 0 && localProxy.port !== cfg.proxyPort) {
        try {
            localProxy.server.close();
        } catch {
            /* ignore */
        }
        localProxy = null;
    }
    if (localProxy && localProxy.port) return Promise.resolve(localProxy.port);
    if (localProxyTask) return localProxyTask;
    localProxyTask = new Promise((resolve) => {
        let settled = false;
        const done = (port) => {
            if (settled) return;
            settled = true;
            resolve(port);
        };
        try {
            const server = http.createServer((cReq, cRes) => {
                handleLocalProxy(cReq, cRes).catch(() => {
                    try {
                        if (!cRes.headersSent) cRes.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
                        cRes.end('jv proxy error');
                    } catch {
                        /* ignore */
                    }
                });
            });
            server.on('clientError', (_e, sock) => {
                try {
                    sock.destroy();
                } catch {
                    /* ignore */
                }
            });
            const onListening = () => {
                const addr = server.address();
                const port = (addr && typeof addr === 'object' && addr.port) || 0;
                if (!port) {
                    try {
                        server.close();
                    } catch {
                        /* ignore */
                    }
                    done(0);
                    return;
                }
                // 别让这个监听口把壳子的进程吊住退出
                server.unref?.();
                localProxy = { server, port };
                done(port);
            };
            const startListen = (p) => {
                try {
                    server.listen(p, '0.0.0.0', onListening);
                } catch {
                    done(0);
                }
            };
            const wantPort = cfg.proxyPort > 0 ? cfg.proxyPort : 0;
            let retried = false;
            server.on('error', () => {
                // 指定端口被占就退回随机端口,不要因此让播放整个挂掉
                if (wantPort && !retried) {
                    retried = true;
                    startListen(0);
                    return;
                }
                done(0);
            });
            startListen(wantPort);
        } catch {
            done(0);
        }
    }).finally(() => {
        localProxyTask = null;
    });
    return localProxyTask;
}

/**
 * 拼出播放器能访问的地址。
 * 用客户端请求插件 API 时带的 Host(那正是播放器所在网络能到达的地址),
 * 只把端口换成我们的代理端口 —— 不写死 127.0.0.1,免得壳子跑在别的机器上。
 */
function localProxyHost(inReq, port) {
    // 手动指定的优先(容器 / 壳子给的 Host 不可达时靠这个)
    if (cfg.proxyHost) return `${cfg.proxyHost}:${port}`;
    let hostname = '';
    try {
        const raw = String(inReq?.headers?.host || inReq?.headers?.Host || '');
        hostname = raw.split(':')[0].trim();
    } catch {
        hostname = '';
    }
    if (!hostname || hostname === '0.0.0.0') hostname = '127.0.0.1';
    return `${hostname}:${port}`;
}

function readAll(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

/** 与 util/req.js 一致:上游 CDN 偶发链不完整时 Node 默认校验会报 unable to verify the first certificate */
const upstreamHttpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

function openUpstream(target, headers) {
    return new Promise((resolve, reject) => {
        let u;
        try {
            u = new URL(target);
        } catch {
            reject(new Error('bad url'));
            return;
        }
        const mod = u.protocol === 'http:' ? http : https;
        const rq = mod.request(
            {
                protocol: u.protocol,
                hostname: u.hostname,
                port: u.port || (u.protocol === 'http:' ? 80 : 443),
                path: `${u.pathname}${u.search}`,
                method: 'GET',
                headers,
                ...(u.protocol === 'https:' ? { agent: upstreamHttpsAgent, rejectUnauthorized: false } : {}),
            },
            resolve,
        );
        rq.setTimeout(120000, () => rq.destroy(new Error('upstream timeout')));
        rq.on('error', reject);
        rq.end();
    });
}

function isPlaylistTarget(url, fallback) {
    const hint = ticketIsPlaylist(url);
    if (hint === true) return true;
    if (hint === false) return false;
    return !!fallback;
}

async function handleLocalProxy(cReq, cRes) {
    if (String(cReq.method || '').toUpperCase() === 'OPTIONS') {
        cRes.writeHead(204, CORS_HEADERS);
        cRes.end();
        return;
    }
    const pathOnly = String(cReq.url || '').split('?')[0];
    const m = pathOnly.match(/^\/jv\/([0-9a-f]{16})\/(\d+)(?:\.[a-z0-9]+)?$/i);
    if (!m) {
        cRes.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
        cRes.end('jv proxy: bad path');
        return;
    }
    const sid = m[1];
    const sess = localSessions.get(sid);
    if (!sess || sess.expires < Date.now()) {
        cRes.writeHead(410, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
        cRes.end('jv proxy: session expired, replay');
        return;
    }
    const n = Number(m[2]);
    const target = sess.urls.get(n);
    if (!target) {
        cRes.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
        cRes.end('jv proxy: unknown item');
        return;
    }
    const kind = sess.kinds.get(n) || 'seg';
    const host = String(cReq.headers?.host || `127.0.0.1:${localProxy?.port || 0}`);
    const mkUrl = (u, k) => `http://${host}/jv/${sid}/${registerLocalUrl(sess, u, k)}`;
    await proxyItem(cReq, cRes, sess, target, kind, mkUrl);
}

async function proxyItem(cReq, cRes, sess, target, kind, mkUrl) {
    const baseHeaders = { ...(sess.headers || {}), 'Accept-Encoding': 'identity', Accept: '*/*' };
    const wantRange = !!cReq.headers?.range;
    const isHead = String(cReq.method || 'GET').toUpperCase() === 'HEAD';
    const asPlaylist = isPlaylistTarget(target, kind === 'pl');

    const fetchUp = async (withRange) => {
        const h = { ...baseHeaders };
        if (withRange && wantRange) h.Range = String(cReq.headers.range);
        return openUpstream(target, h);
    };

    let up;
    try {
        // 播放列表一律整份取:播放器对 m3u8 也会发 Range,原样转上去上游回 206
        // 只给一段,列表就被截断 —— 这是「有的分片能拿、有的直接 403」的根。
        up = await fetchUp(!asPlaylist);
    } catch (e) {
        cRes.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
        cRes.end(`upstream: ${String(e.message || e)}`);
        return;
    }

    const status = up.statusCode && up.statusCode >= 200 && up.statusCode < 600 ? up.statusCode : 502;
    const ctype = String(up.headers['content-type'] || '');

    // 内容嗅探兜底:站点哪天改版,分片路径上冒出播放列表也能兜住
    if (asPlaylist || /mpegurl/i.test(ctype)) {
        let buf;
        try {
            buf = await readAll(up);
        } catch (e) {
            cRes.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
            cRes.end(`upstream: ${String(e.message || e)}`);
            return;
        }
        const text = buf.toString('utf8');
        if (text.includes('#EXTM3U')) {
            const body = Buffer.from(rewriteM3u8(text, target, mkUrl), 'utf8');
            cRes.writeHead(200, {
                ...CORS_HEADERS,
                'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
                // 重写后长度一定变了,不能沿用上游的 Content-Length / Content-Range
                'Content-Length': body.length,
                'Cache-Control': 'no-cache',
            });
            cRes.end(isHead ? undefined : body);
            return;
        }
        // 不是列表(初始化片段之类)就原样回
        cRes.writeHead(status, {
            ...CORS_HEADERS,
            'Content-Type': ctype || 'application/octet-stream',
            'Content-Length': buf.length,
            'Cache-Control': 'no-cache',
        });
        cRes.end(isHead ? undefined : buf);
        return;
    }

    const pass = {};
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag', 'cache-control']) {
        if (up.headers[k] !== undefined) pass[k] = up.headers[k];
    }
    Object.assign(pass, CORS_HEADERS);
    if (!pass['cache-control']) pass['cache-control'] = 'no-cache';

    try {
        cRes.writeHead(status, pass);
    } catch {
        try {
            up.destroy();
        } catch {
            /* ignore */
        }
        return;
    }
    if (isHead) {
        try {
            up.destroy();
        } catch {
            /* ignore */
        }
        cRes.end();
        return;
    }
    up.on('error', () => {
        try {
            cRes.destroy();
        } catch {
            /* ignore */
        }
    });
    cReq.on('close', () => {
        try {
            up.destroy();
        } catch {
            /* ignore */
        }
    });
    up.pipe(cRes);
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
        const prefix = pluginPrefixOf(inReq);
        const qs = `t=${token}&u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
        // 只用真实 http 地址。js2p:// 是壳子内部 RPC 协议,播放器打不开 ——
        // 上一版黑屏就是栽在这:地址本身就不是给播放器用的。
        if (addr?.url && /^https?:\/\//i.test(String(addr.url))) return `${addr.url}${prefix}/proxy/stream?${qs}`;
        const host = inReq?.headers?.host || inReq?.headers?.Host;
        if (host) return `http://${host}${prefix}/proxy/stream?${qs}`;
        if (addr?.port) return `http://127.0.0.1:${addr.port}${prefix}/proxy/stream?${qs}`;
        return '';
    } catch {
        return '';
    }
}

function needsStreamProxy(url) {
    const u = String(url || '');
    return /javverse\.com\/api\/video\//i.test(u) || u.startsWith('/api/video/');
}

function rewriteM3u8(raw, playlistUrl, mkUrl) {
    const lines = String(raw).split(/\r?\n/);
    const mapLine = (line) => {
        const s = line.trim();
        if (!s) return line;
        if (s.startsWith('#')) {
            if (!s.includes('URI="')) return line;
            return line.replace(/URI="([^"]*)"/g, (whole, uri) => {
                if (!uri || uri.startsWith('data:')) return whole;
                try {
                    return `URI="${mkUrl(new URL(uri, playlistUrl).href, 'seg')}"`;
                } catch {
                    return whole;
                }
            });
        }
        try {
            const absUri = new URL(s, playlistUrl).href;
            const hint = ticketIsPlaylist(absUri);
            const kind = hint === true ? 'pl' : hint === false ? 'seg' : /\.m3u8(\?|#|$)/i.test(absUri) ? 'pl' : 'seg';
            return mkUrl(absUri, kind);
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
    Object.entries(extra).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        reply.header(k, v);
    });
}

/**
 * 站点票(ticket)是 base64url(payload).签名,payload 里自带:
 *   { sid, wid, src, exp, target, isPlaylist, bk }
 * isPlaylist 才是判断「这条是播放列表还是视频分片」的唯一可靠依据。
 * 返回 true/false,拿不到就返回 null(交给上层嗅探)。
 */
function ticketIsPlaylist(url) {
    try {
        const raw = String(url || '');
        const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
        let ticket = '';
        for (const part of qs.split('&')) {
            if (part.startsWith('ticket=')) ticket = decodeURIComponent(part.slice(7));
        }
        if (!ticket) return null;
        const payload = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'));
        return typeof payload.isPlaylist === 'boolean' ? payload.isPlaylist : null;
    } catch {
        return null;
    }
}

/** 从票里取出 workId(取票失败时给详情页兜底用) */
function ticketWorkId(url) {
    try {
        const raw = String(url || '');
        const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
        let ticket = '';
        for (const part of qs.split('&')) {
            if (part.startsWith('ticket=')) ticket = decodeURIComponent(part.slice(7));
        }
        if (!ticket) return '';
        const payload = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'));
        return payload.wid ? String(payload.wid) : '';
    } catch {
        return '';
    }
}

function playlistSelfBase(request) {
    const urlPath = String(request.url || '').split('?')[0];
    const prefix = urlPath.replace(/\/proxy\/stream\/?$/i, '') || `/spider/${META_KEY}/3`;
    const host = request.headers?.host;
    // 注意:这里只认真实 http 地址。壳子的 js2p:// 动态地址不能出现在
    // 播放列表里 —— 播放器只会把它当坏链。
    if (host) return `http://${host}${prefix}`;
    const port = request.server?.address?.()?.port;
    if (port) return `http://127.0.0.1:${port}${prefix}`;
    const addrUrl = request.server?.address?.()?.url;
    if (addrUrl && /^https?:\/\//i.test(String(addrUrl))) return `${addrUrl}${prefix}`;
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

    // 关键:站点把「播放列表」和「视频分片」挂在同一个路径下
    //   /api/video/media/stream?ticket=...
    // 光看 URL 根本分不出来。以前拿路径判断 → 每个分片都被当文本抓、
    // 再 slice 一段发下去,播放器收到一堆残缺数据 → 必然黑屏。
    // 这里改成:票里自带 isPlaylist 标记,按标记分流;标记缺失时才嗅探内容。
    const hint = ticketIsPlaylist(target);
    const urlIsM3u8 = /\.m3u8(\?|#|$)/i.test(target);
    const asPlaylist = hint === null ? urlIsM3u8 : hint;

    if (asPlaylist) {
        // 播放器(ffmpeg / ExoPlayer)对 m3u8 也会发 Range,原样转上去上游会回 206
        // 只给一段,播放列表就被截断了 —— 表现就是「有的分片拿到、有的直接 403/播不动」。
        // 播放列表必须整份取,Range 一律剥掉。
        const plHeaders = { ...headers };
        delete plHeaders.Range;
        delete plHeaders['If-Range'];
        let pl;
        try {
            pl = await req.get(target, {
                headers: plHeaders,
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
        // 重写后长度变了,绝不能沿用上游的 content-length / content-range,
        // 否则响应会被截断(这是旧版黑屏的第二个原因)。
        reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Access-Control-Allow-Origin', '*');
        const mkUrl = (u, _k) => `${selfBase}/proxy/stream?t=${token}&u=${b64url(u)}&r=${b64url(referer || '')}`;
        const body = rewriteM3u8(raw, target, mkUrl);
        reply.header('Content-Length', Buffer.byteLength(body));
        reply.send(body);
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
    const looksOk = (h) => {
        const s = String(h || '');
        if (!s || isCfBlock(s) || isBrowseGatePage(s)) return false;
        return s.includes('og:title') || s.includes('"workId"') || s.includes('work-detail');
    };
    let html = await getHtml(url, url);
    if (!looksOk(html)) {
        // 站点的浏览门/人机校验偶尔会抖一下,返回一张空壳页。
        // 这里强制刷一次通行证再取一遍,避免标题/番号整块解析成空。
        await ensureBrowseGate(true);
        const retry = await getHtml(url, url);
        if (looksOk(retry) || String(retry || '').length > String(html || '').length) html = retry;
    }
    return html;
}

function captureVideoKey(setCookie) {
    const key = parseVideoKey(setCookie);
    if (key) videoKeyCookie = key;
    return key;
}

/** 只解析,不写全局 —— 并发取票时各用各的,避免互相覆盖 */
function parseVideoKey(setCookie) {
    for (const raw of toArray(setCookie)) {
        const pair = String(raw).split(';')[0].trim();
        if (/^jav_verse_video_key=/i.test(pair)) return pair;
    }
    return '';
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
        const videoKey = captureVideoKey(r.headers['set-cookie']);
        let data = r.data;
        if (typeof data === 'string') {
            const trimmed = data.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try { data = JSON.parse(trimmed); } catch { data = { text: data.slice(0, 400) }; }
            } else {
                data = trimmed;
            }
        }
        return { status: r.status, data, videoKey };
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
    const videoKey = captureVideoKey(r.headers['set-cookie']);
    let data = r.data;
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try { data = JSON.parse(trimmed); } catch { data = { text: data.slice(0, 400) }; }
        } else {
            data = trimmed;
        }
    }
    return { status: r.status, data, videoKey };
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

/**
 * 用「指定那把」video key 组 cookie。
 * 全局 videoKeyCookie 会被并发取票覆盖,票一旦配错 key 就 403,
 * 所以播放时必须拿取票那一瞬间的快照来组。
 */
function cookieHeaderWith(snapshotKey) {
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
    push(snapshotKey || videoKeyCookie);
    if (sessionLive()) push(buildSupabaseCookie(session));
    return Array.from(bag.values()).join('; ');
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
        let pagecount = pages ? parseInt(pages[1], 10) : 0;
        // 站点有些栏目页数上万(实测 /discover 是 9781 页)。以前只要 >200 就被
        // 砍成「当前页+1」,结果只能翻一页 —— 这里改成照实报,只做一个防溢出的上限。
        if (!pagecount) pagecount = hasNext ? page + 50 : Math.max(page, 1);
        if (pagecount > 9999) pagecount = 9999;
        return { page, pagecount, limit: 48, total: pagecount * 48 };
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

/**
 * 取票(播放凭证)
 * 站点 /api/video/sessions 是「游客也能调」的,不需要登录。
 * 登录只影响 /api/video/prepare(档位元数据),跟取票没关系 ——
 * 旧版把登录当门票,没登录直接返回空地址,这是黑屏的头号原因。
 *
 * 另外两个必须遵守的事实(都实测过):
 *  1) 票和「签发那一刻返回的 jav_verse_video_key cookie」一对一绑定,
 *     换一把 key 就 403 "Media ticket is not for this browser";
 *  2) 票有效期约 4 小时,过期同样 403。
 * 所以每次播放都要重新取票,并把当时那把 cookie 一起带走。
 */
async function fetchTicket(workId, code, variant, referer) {
    const wid = parseInt(workId, 10) || workId;
    const body = { workId: wid, code: code || '' };
    if (variant) body.variant = String(variant);
    const r = await postGuestJson('/api/video/sessions', body, referer);
    const data = (r.data && typeof r.data === 'object') ? r.data : {};
    const playlistUrl = pickPlaylist(data);
    const variants = Array.isArray(data.variants) ? data.variants.map(String) : [];
    const errText = typeof r.data === 'string'
        ? r.data.slice(0, 200)
        : (data.error || data.msg || data.message || '');
    return {
        ok: r.status >= 200 && r.status < 300 && !!playlistUrl,
        status: r.status,
        url: playlistUrl ? abs(playlistUrl) : '',
        variants,
        variant: data.variant ? String(data.variant) : '',
        // 用「本次响应下发的那把」key,而不是全局变量 —— 并发取票时全局会被别的请求覆盖
        cookie: r.videoKey || videoKeyCookie,
        err: errText,
        cf: isCloudflarePayload(r.data),
    };
}

// 解析片源:线路1 = sessions(m3u8) 线路2 = line2(站点已下线,仅在需要时兜底)
async function resolvePlay(workId, code, variant, opts = {}) {
    const lines = [];
    const notes = [];
    if (!workId) return { lines, notes };
    const pageRef = `${site}/work/${workId}`;

    let t = await fetchTicket(workId, code, variant, pageRef);
    // 指定的档位取不到(改版 / 该片没这档)就退回默认档位再取一次
    if (!t.ok && variant) t = await fetchTicket(workId, code, '', pageRef);

    if (t.cf) {
        notes.push('播放接口被 Cloudflare 拦截,请在 ext 里补充浏览器 Cookie(含 cf_clearance)');
    } else if (!t.ok) {
        notes.push(t.err || `取票失败(${t.status})`);
    }

    if (t.ok) {
        const tag = t.variant || variant || 'standard';
        lines.push({ name: `线路1 ${tag}`, url: t.url, cookie: t.cookie });
        t.variants.filter((v) => v !== tag).forEach((v) => {
            lines.push({
                name: `线路1 ${v}`,
                url: `jv://${workId}|${encodeURIComponent(code || '')}|1|${encodeURIComponent(v)}`,
                cookie: '',
            });
        });
    }

    // 线路2 已被站点下线(固定回 line2_off),只有线路1 全挂时才白跑这一趟
    if (!t.ok && !opts.skipLine2) {
        try {
            const s2 = await postGuestJson('/api/video/line2', { workId: parseInt(workId, 10) || workId, code }, pageRef);
            const fileUrl = pickLine2File(s2.data);
            if (s2.status >= 200 && s2.status < 300 && fileUrl) {
                lines.push({ name: '线路2', url: abs(fileUrl), cookie: s2.videoKey || videoKeyCookie });
            }
        } catch {
            /* line2 optional */
        }
    }

    return { lines, notes };
}

/* --------------------------------------------------------------------------
 *  接口实现
 * ------------------------------------------------------------------------ */
async function init(inReq) {
    const ext = (inReq && inReq.body && inReq.body.ext) || {};
    cfg.cookie = ext.cookie || ext.cookieJavverse || cfg.cookie || '';
    // 播放代理模式,不填就是 auto(本地 HTTP 代理优先)
    if (ext.proxy) cfg.proxy = String(ext.proxy).trim().toLowerCase();
    if (ext.proxyHost) cfg.proxyHost = String(ext.proxyHost).trim();
    if (ext.proxyPort) cfg.proxyPort = parseInt(ext.proxyPort, 10) || 0;
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

    // 片源:取票接口游客就能调,拿到票即代表有源(不再依赖需要登录的 prepare)
    const playCode = srcCode || codeText || '';
    const notes = [];
    let canPlay = false;
    let playVariants = [];
    if (workId) {
        const t = await fetchTicket(workId, playCode, '', `${site}/work/${workId}`);
        canPlay = t.ok;
        playVariants = t.variants;
        if (!t.ok && t.err) notes.push(t.err);
    }
    const lineList = [];
    if (workId && canPlay) {
        const tags = playVariants.length ? playVariants : ['standard'];
        tags.forEach((v) => {
            lineList.push(`线路1·${v}$jv://${workId}|${encodeURIComponent(playCode)}|1|${encodeURIComponent(v)}`);
        });
    }
    const playUrl = lineList.length ? lineList.join('#') : '';
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
                vod_remarks: canPlay ? (codeText || '有资源') : '暂无片源',
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
    let cookieSnapshot = '';
    const isJv = url.startsWith('jv://');
    const isSiteStream = /javverse\.com\/api\/video\/|^\/api\/video\//i.test(url);

    if (isJv || isSiteStream) {
        await ensureBrowseGate();
        // 不要每次播放都强制换 token:Supabase 轮换制,强制刷新等于每次都作废旧 token,
        // 一旦落盘失败或并发就会把登录态烧掉。按需刷新就够了。
        await ensureSession();

        let workId = '';
        let code = '';
        let variant = '';
        if (isJv) {
            const seg = url.slice(5).split('|');
            workId = seg[0];
            code = decodeURIComponent(seg[1] || '');
            variant = seg[3] ? decodeURIComponent(seg[3]) : '';
        } else {
            workId = ticketWorkId(url);
            if (!workId) {
                const m = url.match(/[?&]ticket=([^&]+)/);
                if (m) {
                    try {
                        const payload = JSON.parse(Buffer.from(m[1].split('.')[0], 'base64url').toString('utf8'));
                        workId = String(payload.wid || payload.workId || '');
                    } catch { /* ignore */ }
                }
            }
        }
        if (!code && workId) code = await lookupCodeByWorkId(workId);
        pageRef = workId ? `${site}/work/${workId}` : `${site}/`;

        // 每次播放都重新取票:票约 4 小时有效,而且和签发那把 cookie 死绑,
        // 复用详情页那张票过一会儿就 403。
        let t = await fetchTicket(workId, code, variant, pageRef);
        if (!t.ok && variant) t = await fetchTicket(workId, code, '', pageRef);
        if (t.ok) {
            url = t.url;
            cookieSnapshot = t.cookie;
        } else {
            // 线路1 拿不到,最后再试一次线路2(站点基本已下线,聊胜于无)
            url = '';
            const s2 = await postGuestJson('/api/video/line2', { workId: parseInt(workId, 10) || workId, code }, pageRef);
            const fileUrl = pickLine2File(s2.data);
            if (s2.status >= 200 && s2.status < 300 && fileUrl) {
                url = abs(fileUrl);
                cookieSnapshot = videoKeyCookie;
            }
        }
    }

    if (!url || url.startsWith('jv://')) {
        return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: pageRef } };
    }

    const header = baseHeaders(pageRef);
    if (sessionLive()) header.Authorization = `Bearer ${session.access_token}`;
    const cookieLine = cookieHeaderWith(cookieSnapshot);
    if (cookieLine) header.Cookie = cookieLine;

    const fullUrl = abs(url);
    const mode = String(cfg.proxy || 'auto').toLowerCase();
    const dbg = {
        at: new Date().toISOString(),
        mode,
        upstream: fullUrl ? `${fullUrl.slice(0, 90)}...` : '',
        kind: ticketIsPlaylist(fullUrl) === true ? 'playlist' : 'segment',
        hasCookie: !!header.Cookie,
    };
    lastPlayDebug = dbg;

    if (!fullUrl || !needsStreamProxy(fullUrl)) {
        // 不是站点私有片源(线路2 直链等),播放器能直接拉
        return { parse: 0, url: fullUrl, header };
    }

    // ---------- 1)本地 HTTP 代理(默认)----------
    // 给播放器一个普通 http:// 地址,插件自己带 Cookie/Referer 回源。
    if (mode === 'auto' || mode === 'local') {
        const port = await ensureLocalProxy();
        dbg.localPort = port;
        if (port) {
            const sid = newLocalSession(header);
            const sess = localSessions.get(sid);
            const n = registerLocalUrl(sess, fullUrl, 'pl');
            const host = localProxyHost(inReq, port);
            const proxiedUrl = `http://${host}/jv/${sid}/${n}`;
            dbg.picked = 'local';
            dbg.playUrl = proxiedUrl;
            return { parse: 0, url: proxiedUrl, header: { 'User-Agent': UA, Referer: pageRef } };
        }
        dbg.localError = '本地代理起不来(端口被占/环境不允许监听)';
        if (mode === 'local') {
            // 明确只走 local 但起不来,退回直连,至少别返回空地址
            dbg.picked = 'direct(fallback)';
            return { parse: 0, url: fullUrl, header };
        }
    }

    // ---------- 2)壳子自带路由(必须是真实 http 地址)----------
    if (mode !== 'direct') {
        const token = storePlayAuth(header);
        const proxied = proxyStreamPath(inReq, fullUrl, pageRef, token);
        if (proxied) {
            dbg.picked = 'router';
            dbg.playUrl = proxied;
            return { parse: 0, url: proxied, header: { 'User-Agent': UA, Referer: pageRef } };
        }
        dbg.routerError = '壳子没给出可用的 http 地址';
    }

    // ---------- 3)兜底:直连上游,让播放器自己带 header 拉 ----------
    dbg.picked = 'direct';
    return { parse: 0, url: fullUrl, header };
}

/** 播放链路自检:以后播不了,先打这个看断在哪一步 */
async function debugInfo(inReq) {
    const body = (inReq && inReq.body) || {};
    const port = localProxy?.port || 0;
    let local = { running: !!port, port };
    if (!port) {
        const p = await ensureLocalProxy();
        local = { running: !!p, port: p, error: p ? '' : '无法监听本地端口' };
    }
    const out = {
        proxyMode: cfg.proxy,
        localProxy: local,
        localSessions: localSessions.size,
        routerProxySessions: playAuthStore.size,
        login: sessionLive(),
        lastPlay: lastPlayDebug,
    };
    // 带了地址就顺手活着探一次,直接看到上游到底回什么
    const id = String(body.id || body.url || '').trim();
    if (id) {
        const target = /^https?:\/\//.test(id) ? id : `jv://${id}`;
        try {
            const r = await play({ body: { id: target }, headers: (inReq && inReq.headers) || {}, server: inReq?.server });
            out.resolved = { url: String(r?.url || '').slice(0, 200), picked: lastPlayDebug?.picked || '' };
            const u = String(r?.url || '');
            if (u.startsWith('http://')) {
                const up = await openUpstream(u, { 'User-Agent': UA, ...(r?.header || {}) });
                const probe = await readAll(up).catch(() => Buffer.alloc(0));
                out.probe = {
                    status: up.statusCode,
                    contentType: String(up.headers['content-type'] || ''),
                    bytes: probe.length,
                    isPlaylist: probe.toString('utf8', 0, 200).includes('#EXTM3U'),
                    head: probe.toString('utf8', 0, 120).replace(/\s+/g, ' '),
                };
            }
        } catch (e) {
            out.error = String(e && e.message ? e.message : e);
        }
    }
    return out;
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
    meta: { key: 'javverse', name: '🌸JAV·Verse', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.post('/debug', debugInfo);
        fastify.get('/proxy/stream', streamProxy);
    },
};
