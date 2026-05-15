import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { HttpsProxyAgent } from 'https-proxy-agent';

const host = 'https://apiutuxgg.230110.xyz';
const phost = 'https://cdn.230110.xyz';

// AES
const AES_KEY = Buffer.from(
    'OPQT123412FRANME'
);

const AES_IV = Buffer.from(
    'MRDCQP12QPM13412'
);

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
    'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

const http = axios.create({
    timeout: 15000,
    headers,
    httpsAgent: agent,
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

    return Buffer
        .from(str, 'base64')
        .toString('utf8');
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

// ─────────────────────────────────────────────────────
// HTTP Signature
// ─────────────────────────────────────────────────────

function buildHttpSignature(body) {

    const created =
        Math.floor(Date.now() / 1000);

    // body sha256
    const bodyHash = crypto
        .createHash('sha256')
        .update(body)
        .digest('base64');

    const contentDigest =
        `sha-256=:${bodyHash}:`;

    // signature-input
    const signatureInput =
        `v1=("@method" "@target-uri" "content-digest" "@created");created=${created};keyid="http-sign-v1";alg="hmac-sha256"`;

    // 签名字符串
    const signingString =
`"@method": POST
"@target-uri": https://apiutuxgg.230110.xyz/v1
"content-digest": ${contentDigest}
"@created": ${created}`;

    // HMAC SHA256
    const signatureValue = crypto
        .createHmac(
            'sha256',
            SIGN_SECRET
        )
        .update(signingString)
        .digest('base64');

    return {
        'content-digest': contentDigest,
        'signature-input': signatureInput,
        'signature': `v1=:${signatureValue}:`,
        'authorization': '',
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

    // HTTP Signature
    const signHeaders =
        buildHttpSignature(body);

    console.log('payload =>');
    console.log(payload);

    console.log('headers =>');
    console.log(signHeaders);

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

    console.log('response =>');
    console.log(res.data);

    if (
        !res.data ||
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

    const data =
        '9XSPkyFMrOOG34JSg//ZosMof45cyBo9hwZMZ5rvI6Yz/ZZlXWIf8/644OzwW+FNIOdJ61R/Lxjy1tqN+ZzokxtiVzb8LjYAkh6GFudwAUXFt9yS1ZjAxC3tDKrQsJQLk3nym0s00DBBzLBntRBDFz7nbba+OOBuQOZpL3CESGL42l4opdoViQLhO/dIizY1kIOk2NxxpDC9Z751gPl1ctHWuLWhuLG/QWgNWi/iHScjKrMHJKcC9GQHst/4Q3dgZ03eQIIVB6jvoV1XXoBCz6fjM/jM3BXpzSttT4Stglwy93gWuNWuZiKypHK2Q0lO10oM0ceRW2a0fPGId+rNYMRO3cR/C0ZueD4cmTAVOuxVr9ZZSP8/nhD0bHyAPONXtchIDJb0O/kdFHk2KTJfQ5q4fHOyzezczc4iQDV/R0S8cGZKM14MF+wytA/iljfj43H0UYqq5pM+MCUGRTdYEtuxCp0+A+DiOhNZwY/Km/TgBoGZQWGbpljJ2LAVnWhxX+ickLH7zuR/FeIwP/R8zOuR+8C8UlT9eHTqtvfNzaGdFxt316atHy8TNjRO7J5a177mqsHs3ziG0toDDzLDCbhRUjFgVA3ktahhXiWaaCo/ZGSJAA8TDO5DYqnJ0JDaX0ILPj8QB5zxrHYmRE8PboIr3RBAjz1sREbaHfjrUjoh29ePhlolLV00EvgoxP5knaqt5Ws/sq5IG57qKCAPgqXzblPLHToJGBtukKhLp8jbGJrkb6PVn4/jysks0NGE';

    return {
        class: aes(data, false),
        list: [],
        filters: {},
    };
}

async function category(
    inReq,
    _outResp
) {

    const tid =
        inReq.body.id;

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
            'latest_video_filter_type',
        lang: 'zh-cn',
        route: '/videos/search',
        type_id: tid,
    };

    const res =
        await getdata(data);

    return {
        page: pg,
        pagecount: 9999,
        limit: 90,
        total: 999999,
        list: getl(res),
    };
}

async function detail(
    inReq,
    _outResp
) {

    const id =
        inReq.body.id;

    const data = {
        limit: 1,
        filter: [
            `video_id = ${id}`
        ],
        lang: 'zh-cn',
        route: '/videos/search',
    };

    const res =
        await getdata(data);

    const item = res[0];

    const purl =
        rebase(item.video_url);

    return {
        list: [{
            vod_id: id,
            vod_play_from: 'dsysav',
            vod_play_url:
                `${item.video_duration}$${purl}`,
        }],
    };
}

async function play(
    inReq,
    _outResp
) {

    let id =
        inReq.body.id;

    if (
        id.endsWith('.mpd')
    ) {

        id =
            `http://127.0.0.1:3000/proxy?url=${e64(id)}&type=mpd`;
    }

    return {
        parse: 0,
        url: id,
        header: headers,
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
        q: key,
        filter: [],
        offset: (pg - 1) * 24,
        limit: 24,
        sort: ['video_time:desc'],
        lang: 'zh-cn',
        route: '/videos/search',
    };

    const res =
        await getdata(data);

    return {
        list: getl(res),
        page: pg,
    };
}

// ─────────────────────────────────────────────────────
// localProxy
// ─────────────────────────────────────────────────────

async function localProxy(param) {

    // MPD
    if (
        param.type &&
        param.type === 'mpd'
    ) {

        const url =
            d64(param.url);

        const ids =
            url.split('/');

        const id =
            `${ids[ids.length - 3]}/${ids[ids.length - 2]}/`;

        const xpu =
            `http://127.0.0.1:3000/proxy?path=`;

        const response =
            await http.get(url);

        let data =
            response.data;

        data = data
            .replace(
                /initialization="/g,
                `initialization="${xpu}${id}`
            )
            .replace(
                /media="/g,
                `media="${xpu}${id}`
            );

        return [
            200,
            'application/octet-stream',
            {},
            data,
        ];
    }

    // 分片
    const expire =
        Math.floor(Date.now() / 1000)
        + 3600;

    const raw =
        `${SIGN_SECRET}/mpd/${param.path}${expire}`;

    const hex =
        md5(raw);

    const sign = Buffer
        .from(hex, 'hex')
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const url =
        `${phost}/mpd/${param.path}?sign=${sign}&expire=${expire}`;

    const response =
        await http({
            url,
            method: 'GET',
            responseType: 'stream',
        });

    return [
        200,
        response.headers[
            'content-type'
        ],
        {},
        response.data,
    ];
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

        fastify.post(
            '/init',
            init
        );

        fastify.post(
            '/home',
            home
        );

        fastify.post(
            '/category',
            category
        );

        fastify.post(
            '/detail',
            detail
        );

        fastify.post(
            '/play',
            play
        );

        fastify.post(
            '/search',
            search
        );

        fastify.get(
            '/proxy',
            async (
                req,
                reply
            ) => {

                const [
                    status,
                    mime,
                    hdrs,
                    body,
                ] =
                    await localProxy(
                        req.query
                    );

                reply
                    .status(status)
                    .headers(
                        hdrs || {}
                    )
                    .type(mime)
                    .send(body);
            }
        );
    },
};