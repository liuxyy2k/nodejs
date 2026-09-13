import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { HttpsProxyAgent } from 'https-proxy-agent';

const host = 'https://apin8i2h1.230110.xyz';
const phost = 'https://cdn.230110.xyz';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

// AES
const AES_KEY = Buffer.from('OPQT123412FRANME');

const AES_IV = Buffer.from('MRDCQP12QPM13412');

// 签名 key
const SIGN_SECRET =
    'AjPuom638LmWfWyeM5YueKuJ9PuWLdRn';

// 代理
const agent = new HttpsProxyAgent(
    'http://127.0.0.1:7897'
);

// 公共 headers
const headers = {
    origin: 'https://dsav.app',
    referer: 'https://dsav.app/',
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
};

const playHeaders = {
    origin: 'https://dsav.app',
    referer: 'https://dsav.app/',
    'user-agent': headers['user-agent'],
};

const http = axios.create({
    timeout: 15000,
    headers,
    // httpsAgent: agent,
});

// ─────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────

function md5(str) {
    return crypto
        .createHash('md5')
        .update(str, 'utf8')
        .digest('hex');
}

function e64(str) {
    return Buffer
        .from(str, 'utf8')
        .toString('base64');
}

function d64(str) {
    const s = String(str || '')
        .replace(/ /g, '+')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    return Buffer.from(s, 'base64').toString('utf8');
}

// AES
function aes(text, operation = true) {
    // 加密
    if (operation) {
        const cipher =
            crypto.createCipheriv(
                'aes-128-cbc',
                AES_KEY,
                AES_IV
            );

        let encrypted =
            cipher.update(
                JSON.stringify(text),
                'utf8',
                'base64'
            );

        encrypted += cipher.final('base64');
        return encrypted;
    }

    // 解密
    const decipher =
        crypto.createDecipheriv(
            'aes-128-cbc',
            AES_KEY,
            AES_IV
        );

    let decrypted =
        decipher.update(
            text,
            'base64',
            'utf8'
        );

    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
}

// 图片重定向
function rebase(url) {
    try {
        const u = new URL(url);
        return new URL(
            u.pathname,
            phost
        ).href;
    } catch (e) {
        return url;
    }
}

function getProxyBase(inReq) {
    const prefix =inReq?.server?.prefix ||'/spider/dsav/3';
    // let port = process.env.DEV_HTTP_PORT || '';
    // const hostHeader = String(
    //     inReq?.headers?.['x-forwarded-host'] ||
    //     inReq?.headers?.host ||
    //     ''
    // )
    //     .split(',')[0]
    //     .trim();
    // const m = /:(\d+)$/.exec(hostHeader);

    // if (m) {
    //     port = m[1];
    // }
    // if (!port) {
    //     try {
    //         const addr =inReq?.server?.address?.();

    //         if (addr?.port) {
    //             port = String(addr.port);
    //         }

    //     } catch (e) {}
    // }

    // if (!port) {
    //     port = '9988';
    // }
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function cdnSign(pathname, expire) {
    const hex = md5(`${SIGN_SECRET}${pathname}${expire}`);

    return Buffer
        .from(hex, 'hex')
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function signedCdnUrl(absUrl) {
    const expire =
        siteConfig?.video_sign_expire ||
        Math.floor(Date.now() / 1000) +
            3600;

    const u = new URL(absUrl);
    const sign =
        cdnSign(u.pathname, expire);

    u.searchParams.set('sign', sign);
    u.searchParams.set(
        'expire',
        String(expire)
    );

    return u.href;
}

function mpdDir(url) {

    const parts = new URL(url)
        .pathname
        .split('/')
        .filter(Boolean);

    return parts
        .slice(1, -1)
        .join('/');
}

function dashAttr(tag, name) {
    const m = new RegExp(
        `${name}="([^"]*)"`,
        'i'
    ).exec(tag || '');
    return m ? m[1] : '';
}

function parseDashSets(xml) {
    const sets = [];
    const setRe =/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
    let m;
    while ((m = setRe.exec(xml))) {

        const attrs = m[1];
        const body = m[2];
        let contentType =
            dashAttr(attrs, 'contentType');
        const mime =
            dashAttr(attrs, 'mimeType');

        if (!contentType) {

            if (mime.startsWith('audio')) {

                contentType = 'audio';

            } else if (mime.startsWith('video')) {

                contentType = 'video';

            } else if (
                /<AudioChannelConfiguration/i.test(
                    body
                )
            ) {

                contentType = 'audio';

            } else if (
                /width=|height=/.test(body)
            ) {

                contentType = 'video';
            }
        }

        const rep =
            /<Representation\b([^>]*)>/.exec(
                body
            );
        const repAttrs = rep ? rep[1] : '';
        const repId =
            dashAttr(repAttrs, 'id') || '0';
        const bandwidth =
            dashAttr(repAttrs, 'bandwidth') ||
            dashAttr(attrs, 'bandwidth') ||
            '1000000';
        const width = dashAttr(repAttrs, 'width');
        const height =
            dashAttr(repAttrs, 'height');
        const codecs =
            dashAttr(repAttrs, 'codecs') ||
            dashAttr(attrs, 'codecs');
        const tpl =
            /<SegmentTemplate\b([^>]*)/.exec(
                body
            );
        const tplAttrs = tpl ? tpl[1] : '';
        const timescale = parseInt(
            dashAttr(tplAttrs, 'timescale') ||
                '1',
            10
        );
        const startNumber = parseInt(
            dashAttr(tplAttrs, 'startNumber') ||
                '1',
            10
        );
        let initialization = dashAttr(
            tplAttrs,
            'initialization'
        );
        let media = dashAttr(tplAttrs, 'media');

        initialization = initialization.replace(
            /\$RepresentationID\$/g,
            repId
        );
        media = media.replace(
            /\$RepresentationID\$/g,
            repId
        );

        const segs = [];
        const sRe = /<S\b([^>]*)\/?>/g;
        let sm;

        while ((sm = sRe.exec(body))) {

            const a = sm[1];
            const d = parseInt(
                dashAttr(a, 'd') || '0',
                10
            );
            const r = parseInt(
                /\br="(\d+)"/.exec(a)?.[1] ||
                    '0',
                10
            );

            if (d > 0) {

                segs.push({ d, r });
            }
        }

        sets.push({
            contentType,
            repId,
            bandwidth,
            width,
            height,
            codecs,
            timescale,
            startNumber,
            initialization,
            media,
            segs,
        });
    }

    return sets;
}

function formatMediaPath(media, n) {

    return media.replace(
        /\$Number(?:%0(\d+)d)?\$/g,
        (_, w) => {

            const s = String(n);

            return w
                ? s.padStart(parseInt(w, 10), '0')
                : s;
        }
    );
}

function buildMediaM3u8(set, segBase) {

    const durs = [];

    for (const s of set.segs) {

        const count = (s.r || 0) + 1;
        const sec = s.d / set.timescale;

        for (let i = 0; i < count; i++) {

            durs.push(sec);
        }
    }

    const target = Math.max(
        1,
        Math.ceil(Math.max(0, ...durs))
    );
    const lines = [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        `#EXT-X-TARGETDURATION:${target}`,
        `#EXT-X-MEDIA-SEQUENCE:${set.startNumber}`,
        '#EXT-X-INDEPENDENT-SEGMENTS',
        `#EXT-X-MAP:URI="${segBase}${set.initialization}"`,
    ];

    let n = set.startNumber;

    for (const dur of durs) {

        lines.push(`#EXTINF:${dur.toFixed(3)},`);
        lines.push(
            `${segBase}${formatMediaPath(set.media, n)}`
        );
        n += 1;
    }

    lines.push('#EXT-X-ENDLIST');

    return `${lines.join('\n')}\n`;
}

function buildMasterM3u8(sets, qs) {

    const video =
        sets.find(
            (s) => s.contentType === 'video'
        ) || sets[0];
    const audio = sets.find(
        (s) => s.contentType === 'audio'
    );
    const lines = [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-INDEPENDENT-SEGMENTS',
    ];

    if (audio) {

        lines.push(
            `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="audio",DEFAULT=YES,AUTOSELECT=YES,URI="a.m3u8?${qs}&track=audio"`
        );
    }

    const codecs = [video.codecs, audio?.codecs]
        .filter(Boolean)
        .join(',');
    const res =
        video.width && video.height
            ? `,RESOLUTION=${video.width}x${video.height}`
            : '';
    const audioAttr = audio ? ',AUDIO="aac"' : '';

    lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${video.bandwidth}${res}${codecs ? `,CODECS="${codecs}"` : ''}${audioAttr}`
    );
    lines.push(`v.m3u8?${qs}&track=video`);

    return `${lines.join('\n')}\n`;
}

async function fetchMpdXml(absUrl) {

    await ensureConfig().catch(() => {});

    const response = await axios.get(
        signedCdnUrl(absUrl),
        {
            httpsAgent: agent,
            timeout: 20000,
            responseType: 'text',
            headers: playHeaders,
            validateStatus: () => true,
        }
    );

    if (
        response.status >= 400 ||
        typeof response.data !== 'string'
    ) {

        throw new Error(
            `mpd ${response.status}`
        );
    }

    return response.data;
}

// 官网 /config 下发的 HTTP 签名密钥
let siteConfig = null;

async function ensureConfig() {

    if (
        siteConfig &&
        siteConfig.http_sign_key
    ) {

        return siteConfig;
    }

    siteConfig = await getdata({
        lang: 'zh-cn',
        route: '/config',
    });

    return siteConfig;
}

// ─────────────────────────────────────────────────────
// HTTP Signature（与官网 worker 一致）
// ─────────────────────────────────────────────────────

function buildHttpSignature(
    body,
    targetUri,
    signKey,
    signId = 'http-sign-v1'
) {

    const created =
        Math.floor(Date.now() / 1000);

    const bodyHash = crypto
        .createHash('sha256')
        .update(body)
        .digest('base64');

    const contentDigest =
        `sha-256=:${bodyHash}:`;

    const inner =
        `("@method" "@target-uri" "content-digest" "@created");created=${created};keyid="${signId}";alg="hmac-sha256"`;

    // content-digest 不加引号；必须带 @signature-params
    const signingString = [
        `"@method": POST`,
        `"@target-uri": ${targetUri}`,
        `content-digest: ${contentDigest}`,
        `"@created": ${created}`,
        `"@signature-params": ${inner}`,
    ].join('\n');

    const signatureValue = crypto
        .createHmac(
            'sha256',
            Buffer.from(signKey, 'utf8')
        )
        .update(signingString)
        .digest('base64');

    return {
        'content-digest': contentDigest,
        'signature-input': `v1=${inner}`,
        signature: `v1=:${signatureValue}:`,
        authorization: '',
    };
}

// ─────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────

async function getdata(data) {

    const uid = uuidv4();

    const t =
        Math.floor(Date.now() / 1000);

    const json =
        JSON.stringify(data);

    // 原始 sign
    const sign = md5(
        `${e64(json)}${uid}${t}${SIGN_SECRET}`
    );

    const payload = {
        sign,
        nonce: uid,
        timestamp: t,
        data: aes(data),
    };

    const body =
        JSON.stringify(payload);

    let signHeaders = {};

    // /config 不签名；其它路由必须用 config 下发的 http_sign_key
    if (
        data.route &&
        data.route !== '/config'
    ) {

        const cfg =
            await ensureConfig();

        signHeaders =
            buildHttpSignature(
                body,
                data.route,
                cfg.http_sign_key,
                cfg.http_sign_id ||
                    'http-sign-v1'
            );
    }

    const res = await http.post(
        `${host}/v1`,
        body,
        {
            headers: {
                ...signHeaders,
                'content-length':
                    Buffer.byteLength(body),
            },
        }
    );

    if (
        !res.data ||
        res.data.code !== 200 ||
        typeof res.data.data !== 'string'
    ) {

        throw new Error(
            res.data?.msg || '接口返回异常'
        );
    }

    return aes(
        res.data.data,
        false
    );
}

// ─────────────────────────────────────────────────────
// 列表转换
// ─────────────────────────────────────────────────────

function getl(data) {

    const videos = [];

    for (const i of data) {

        let img = i.video_cover;

        if (
            img &&
            img.includes('http')
        ) {

            img = rebase(img);
        }

        videos.push({
            vod_id: i.video_id,
            vod_name: i.video_title,
            vod_pic: img,
            vod_remarks: i.video_duration,
            style: {
                type: 'rect',
                ratio: 1.33,
            },
        });
    }

    return videos;
}

// ─────────────────────────────────────────────────────
// handlers
// ─────────────────────────────────────────────────────

async function init(
    _inReq,
    _outResp
) {

    return {};
}

async function home(
    _inReq,
    _outResp
) {

    const cfg =
        await ensureConfig();

    const classes =
        (cfg.video_type || [])
            .filter((i) => i.type_id > 0)
            .map((i) => ({
                type_id: i.type_id,
                type_name: i.type_name,
            }));

    return {
        class: classes,
        list: [],
        filters: {},
    };
}

async function category(
    inReq,
    _outResp
) {

    const tid =
        String(
            inReq.body.id ?? ''
        );

    const pg =
        parseInt(
            inReq.body.page
        ) || 1;

    // tag 搜索
    if (
        tid.startsWith('skey_')
    ) {

        return search({
            body: {
                wd: tid
                    .split('_')
                    .pop(),
                pg: String(pg),
            },
        });
    }

    const data = {
        search_type:
            'video_type_search',
        type_id: Number(tid),
        offset: (pg - 1) * 24,
        limit: 24,
        lang: 'zh-cn',
        route: '/videos/search',
    };

    const res =
        await getdata(data);

    return {
        page: pg,
        pagecount: 9999,
        limit: 90,
        total: 999999,
        list: getl(
            Array.isArray(res)
                ? res
                : []
        ),
    };
}

async function detail(
    inReq,
    _outResp
) {
    const id =inReq.body.id;
    const data = {
        search_type: 'video_detail_filter_id',
        video_id: id,
        lang: 'zh-cn',
        route: '/videos/search',
    };

    const res = await getdata(data);

    const item =
        Array.isArray(res)
            ? res[0]
            : res;

    const purl = rebase(item.video_url);

    return {
        list: [{
            vod_id: id,
            vod_play_from: 'HLS$$$DASH',
            vod_play_url: `播放$hls:${purl}$$$播放$dash:${purl}`,
        }],
    };
}

async function play(inReq,_outResp) {
    let id = inReq.body.id;
    let mode = 'hls';
    const raw = String(id || '');
    if (raw.startsWith('dash:')) {
        mode = 'dash';
        id = raw.slice(5);
    } else if (raw.startsWith('hls:')) {
        id = raw.slice(4);
    }
    if (String(id).includes('.mpd')) {
        const q =`url=${encodeURIComponent(e64(id))}`;
        if (mode === 'dash') {
            return {
                parse: 0,
                jx: 0,
                url: `${getProxyBase(inReq)}/index.mpd?${q}&type=mpd`,
                header: {
                    'User-Agent': playHeaders['user-agent'],
                    Referer: playHeaders.referer,
                    Origin: playHeaders.origin,
                },
                format: 'application/dash+xml',
            };
        }

        id = `${getProxyBase(inReq)}/index.m3u8?${q}&type=hls&track=video`;
    }

    return {
        parse: 0,
        jx: 0,
        url: id,
        header: {
            'User-Agent': playHeaders['user-agent'],
            Referer: playHeaders.referer,
            Origin: playHeaders.origin,
        },
        format: 'application/x-mpegURL',
        type: 'm3u8',
    };
}

async function search(
    inReq,
    _outResp
) {

    const key =
        inReq.body.wd || '';

    const pg =
        parseInt(
            inReq.body.pg
        ) || 1;

    const data = {
        search_type:
            'video_wd_search',
        q: key,
        offset: (pg - 1) * 24,
        limit: 24,
        lang: 'zh-cn',
        route: '/videos/search',
    };

    const res =
        await getdata(data);

    return {
        list: getl(
            Array.isArray(res)
                ? res
                : []
        ),
        page: pg,
    };
}

// ─────────────────────────────────────────────────────
// localProxy
// ─────────────────────────────────────────────────────

async function proxyMpd(param, req) {

    const url = d64(param.url);
    const xml = await fetchMpdXml(url);

    // 不要把 $Number%05d$ 写成绝对 URL，%05 会被当成百分号编码。
    // 用 BaseURL 拼前缀，模板保持相对路径。
    const base =
        `${getProxyBase(req)}/seg/${mpdDir(url)}/`;

    const data = xml
        .replace(
            /<BaseURL>[\s\S]*?<\/BaseURL>/gi,
            ''
        )
        .replace(
            /(<Period\b[^>]*>)/i,
            `$1<BaseURL>${base}</BaseURL>`
        );

    return [
        200,
        'application/dash+xml',
        {
            'access-control-allow-origin':
                '*',
            'cache-control': 'no-cache',
        },
        data,
    ];
}

async function proxyHls(param, req) {

    const url = d64(param.url);
    const xml = await fetchMpdXml(url);
    const sets = parseDashSets(xml);

    if (!sets.length) {
        throw new Error('empty mpd');
    }

    const qs = `url=${encodeURIComponent(param.url)}&type=hls`;
    const track = String(param.track || '');
    const video =
        sets.find(
            (s) => s.contentType === 'video'
        ) || sets[0];
    const audio = sets.find(
        (s) => s.contentType === 'audio'
    );
    const segBase =
        `${getProxyBase(req)}/seg/${mpdDir(url)}/`;

    let body = '';
    if (track === 'audio' && audio) {

        body = buildMediaM3u8(audio, segBase);

    } else if (
        track === 'video' ||
        track === 'media' ||
        !audio
    ) {
        body = buildMediaM3u8(video, segBase);
    } else {
        body = buildMasterM3u8(sets, qs);
    }

    return [
        200,
        'application/vnd.apple.mpegurl',
        {
            'access-control-allow-origin':
                '*',
            'cache-control': 'no-cache',
        },
        body,
    ];
}

async function proxySeg(segPath, req) {
    if (!segPath) {
        throw new Error('missing path');
    }
    try {
        await ensureConfig();
    } catch (e) {}
    const expire =
        siteConfig?.video_sign_expire ||
        Math.floor(Date.now() / 1000) +
            3600;
    const pathname =`/mpd/${String(segPath).replace(/^\/+/, '')}`;
    const url = `${phost}${pathname}?sign=${cdnSign(pathname, expire)}&expire=${expire}`;
    const hdrs = {
        ...playHeaders,
    };
    if (req?.headers?.range) {
        hdrs.Range = req.headers.range;
    }
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
        httpsAgent: agent,
        timeout: 30000,
        headers: hdrs,
        validateStatus: () => true,
        maxRedirects: 0,
    });
    const out = {
        'access-control-allow-origin':
            '*',
        'access-control-allow-headers':
            'range',
        'access-control-expose-headers':
            'content-length,content-range,accept-ranges',
    };

    for (const k of [
        'content-length',
        'content-range',
        'accept-ranges',
    ]) {
        if (response.headers[k]) {
            out[k] = response.headers[k];
        }
    }
    return [
        response.status,
        response.headers['content-type'] ||
            'application/octet-stream',
        out,
        Buffer.from(response.data || []),
    ];
}

async function localProxy(param, req) {
    if (param.type === 'hls' || param.type === 'm3u8') {
        return proxyHls(param, req);
    }
    if (param.type === 'mpd') {
        return proxyMpd(param, req);
    }
    return proxySeg(param.path, req);
}

// ─────────────────────────────────────────────────────
// export
// ─────────────────────────────────────────────────────

export default {
    meta: {
        key: 'dsav',
        name: '🔥DSYS',
        type: 3,
    },

    api: async (fastify) => {
        fastify.post('/init',init);
        fastify.post('/home', home);
        fastify.post('/category',category);
        fastify.post('/detail',detail);
        fastify.post('/play',play);
        fastify.post('/search',search);
        const sendProxy = (reply, result) => {
            const [status, mime, hdrs, body] = result;
            if (hdrs) {
                for (const [k, v] of Object.entries(hdrs)) {
                    if (v != null) reply.header(k, v);
                }
            }
            if (mime && !hdrs?.['content-type']) {
                reply.type(mime);
            }
            return reply.code(status).send(body);
        };

        const proxyQuery = async (req, reply) => {
            try {
                const q = { ...req.query };
                const path = String(req.url || '');
                if (!q.type) {
                    if (path.includes('.m3u8')) q.type = 'hls';
                    if (path.includes('.mpd')) q.type = 'mpd';
                }
                if (!q.track) {
                    if (path.includes('/v.m3u8')) q.track = 'video';
                    if (path.includes('/a.m3u8')) q.track = 'audio';
                }
                return sendProxy(reply, await localProxy(q, req));
            } catch (e) {
                return reply.code(502).send(String(e.message || e));
            }
        };

        fastify.get('/proxy', proxyQuery);
        fastify.get('/proxy/index.m3u8', proxyQuery);
        fastify.get('/proxy/v.m3u8', proxyQuery);
        fastify.get('/proxy/a.m3u8', proxyQuery);
        fastify.get('/proxy/index.mpd', proxyQuery);
        fastify.get('/proxy/seg/*', async (req, reply) => {
            try {
                let segPath = req.params['*'] || '';
                if (!segPath) {
                    const raw = String(req.raw.url || '');
                    const idx = raw.indexOf('/proxy/seg/');
                    if (idx >= 0) {
                        segPath = decodeURIComponent(
                            raw.slice(idx + '/proxy/seg/'.length).split('?')[0]
                        );
                    }
                }
                return sendProxy(reply, await proxySeg(segPath, req));
            } catch (e) {
                return reply.code(502).send(String(e.message || e));
            }
        });
    },
};