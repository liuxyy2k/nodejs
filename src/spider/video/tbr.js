import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

/**
 * TBR - https://dpi4.tbrapi.org
 * 加密 API (AES-CFB) + 图片 AES-CBC 代理
 */


const host = 'https://dpi4.tbrapi.org';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const AES_KEY = Buffer.from('7205a6c3883caf95b52db5b534e12ec3', 'utf8');
const AES_IV = Buffer.from('81d7beac44a86f43', 'utf8');
const SIGN_KEY = '7205a6c3883caf95b52db5b534e12ec3';
const IMG_KEY = Buffer.from('f5d965df75336270', 'utf8');
const IMG_IV = Buffer.from('97b60394abc2fbe1', 'utf8');

const SYSTEM_PARAMS = {
    system_oauth_type: 'pwa',
    system_oauth_id: 'egzmJgnUCTYIlCxD_1722416055782',
    system_oauth_new_id: '',
    system_version: '3.0.1',
    system_token: '',
    system_app_type: '',
    system_build: '',
    system_build_id: '',
};

const CLASS_NAMES = '推荐&制片厂&最新&经典三级&经典电影&国产&动漫CG&欧美&日韩&小视频&合集&分类'.split('&');
const CLASS_IDS = 'recommend&factory&newest&classic&classic_movie&domestic&anime&western&asian&smallvideo&compilation&categories'.split('&');

const TAB_ID_MAP = {
    recommend: '1',
    factory: '2',
    newest: '10',
    classic: '5',
    classic_movie: '6',
    domestic: '4',
    anime: '12',
    western: '2',
    asian: '1',
};

const http = axios.create({
    timeout: 10_000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
    },
});

function log(msg) {
    console.log(`[TBR] ${msg}`);
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/tbr/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}/proxy`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}/proxy`;
}

function aesEncrypt(plaintext) {
    const cipher = crypto.createCipheriv('aes-128-cfb', AES_KEY, AES_IV);
    return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('hex').toUpperCase();
}

function aesDecrypt(ciphertext) {
    const decipher = crypto.createDecipheriv('aes-128-cfb', AES_KEY, AES_IV);
    const buf = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]);
    try {
        return buf.toString('utf8');
    } catch {
        return buf.toString('latin1');
    }
}

function generateSign(data, timestamp) {
    const s = `client=pwa&data=${data}&timestamp=${timestamp}${SIGN_KEY}`;
    const sha256 = crypto.createHash('sha256').update(s).digest('hex');
    return crypto.createHash('md5').update(sha256).digest('hex');
}

async function apiRequest(endpoint, params) {
    const data = { ...SYSTEM_PARAMS, ...params };
    const dataJson = JSON.stringify(data);
    const encryptedData = aesEncrypt(dataJson);
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(encryptedData, timestamp);

    const body = new URLSearchParams({
        client: 'pwa',
        timestamp: String(timestamp),
        data: encryptedData,
        sign,
    });

    try {
        const resp = await http.post(host + endpoint, body.toString());
        const respJson = resp.data;
        if (!respJson?.data) return null;
        const decrypted = aesDecrypt(respJson.data);
        return JSON.parse(decrypted);
    } catch (e) {
        log(`[api] 请求失败: ${endpoint} ${e.message}`);
        return null;
    }
}

function extractItems(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.list)) return data.list;
    return [];
}

function decryptImageUrl(encryptedUrl, inReq) {
    if (!encryptedUrl) return '';

    let imgUrl = '';
    if (encryptedUrl.startsWith('http')) {
        imgUrl = encryptedUrl;
    } else if (encryptedUrl.startsWith('{') && encryptedUrl.includes('"ori"')) {
        try {
            const imgInfo = JSON.parse(encryptedUrl);
            imgUrl = imgInfo.ori || imgInfo['720'] || imgInfo['360'] || '';
            if (!imgUrl.startsWith('http')) return encryptedUrl;
        } catch (e) {
            log(`[img] JSON解析失败: ${e.message}`);
            return encryptedUrl;
        }
    } else if (/^[A-Za-z0-9]+$/.test(encryptedUrl)) {
        try {
            const decipher = crypto.createDecipheriv('aes-128-cbc', IMG_KEY, IMG_IV);
            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(encryptedUrl, 'hex')),
                decipher.final(),
            ]);
            imgUrl = decrypted.toString('utf8').replace(/\0+$/, '');
        } catch (e) {
            log(`[img] URL解密失败: ${e.message}`);
            return encryptedUrl;
        }
    } else {
        return encryptedUrl;
    }

    if (!imgUrl.startsWith('http')) return encryptedUrl;

    const imgUrlB64 = Buffer.from(imgUrl, 'utf8').toString('base64');
    const base = getProxyBase(inReq);
    return `${base}?type=tbr_img&url=${encodeURIComponent(imgUrlB64)}`;
}

function processPlayUrl(url) {
    return String(url || '').replace(/&seconds=30/g, '');
}

function mapVideoItem(item, inReq) {
    return {
        vod_id: item.preview_video || '',
        vod_name: item.title || '',
        vod_pic: decryptImageUrl(item.thumb_cover_str || '', inReq),
        vod_remarks: item.duration_str || '',
    };
}

function mapFolderItem(vodId, name, pic, remarks, inReq) {
    return {
        vod_id: vodId,
        vod_name: name,
        vod_pic: pic ? decryptImageUrl(pic, inReq) : '',
        vod_remarks: remarks || '',
        vod_tag: 'folder',
    };
}

async function fetchRecommend(inReq) {
    const result = await apiRequest('/pwa.php/api/MvList/recommend', { page: '1', _t: '1' });
    return extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
}

async function categoryContent(tid, pg, extend, inReq) {
    const page = parseInt(pg, 10) || 1;
    let videoList = [];

    if (tid === 'categories') {
        const result = await apiRequest('/pwa.php/api/MvSearch/getStyle', {});
        for (const category of extractItems(result?.data)) {
            for (const sub of category.child || []) {
                videoList.push(mapFolderItem(`style:${sub.id || ''}`, sub.name || '', '', '', inReq));
            }
        }
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    if (tid.startsWith('style:')) {
        const styleId = tid.replace('style:', '');
        const result = await apiRequest('/pwa.php/api/MvList/style', {
            page: String(page),
            size: '15',
            id: styleId,
            orderBy: 'id',
        });
        videoList = extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    if (tid.startsWith('creator:')) {
        const uuid = tid.replace('creator:', '');
        const p0 = (page - 1) * 50;
        const result = await apiRequest('/pwa.php/api/Creator/featured', {
            size: '15',
            uuid,
            lastId: String(p0),
        });
        videoList = extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    if (tid === 'smallvideo') {
        const tag = extend?.tag || 'recommend';
        const result = await apiRequest('/pwa.php/api/MvList/smallVideoByTag', {
            page: String(page),
            tag,
        });
        videoList = extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    if (tid === 'featured_long') {
        const result = await apiRequest('/pwa.php/api/topic/feature', { page: String(page) });
        videoList = extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    if (tid === 'featured_small') {
        const result = await apiRequest('/pwa.php/api/topic/small', { page: String(page) });
        videoList = extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    if (tid === 'compilation') {
        const result = await apiRequest('/pwa.php/api/compilation/list', {
            page: String(page),
            sort: 'new',
        });
        videoList = extractItems(result?.data).map((item) =>
            mapFolderItem(
                `compilation:${item.id || ''}`,
                item.title || '',
                item.image || '',
                item.date || '',
                inReq,
            ),
        );
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    if (tid.startsWith('compilation:')) {
        const compilationId = tid.replace('compilation:', '');
        const result = await apiRequest('/pwa.php/api/compilation/mvlist', {
            limit: '10',
            id: compilationId,
            page: String(page),
        });
        videoList = extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
        return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
    }

    let result;
    if (tid === 'recommend') {
        result = await apiRequest('/pwa.php/api/MvList/recommend', { page: String(page), _t: '1' });
    } else if (tid === 'factory') {
        result = await apiRequest('/pwa.php/api/MvList/featuredzpc', { page: String(page), _t: '1' });
    } else {
        result = await apiRequest('/pwa.php/api/MvList/featured', {
            page: String(page),
            tabId: TAB_ID_MAP[tid] || '1',
        });
    }

    if (result?.data) {
        videoList = extractItems(result.data).map((item) => mapVideoItem(item, inReq));
    }
    return { list: videoList, page, pagecount: 9999, limit: 15, total: 99999 };
}

function isImageBuffer(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50) return true;
    if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
        return true;
    }
    return false;
}

function detectImageType(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

function trimTrailingNull(buf) {
    let end = buf.length;
    while (end > 0 && buf[end - 1] === 0) end -= 1;
    return end === buf.length ? buf : buf.subarray(0, end);
}

function tryBase64Image(buf) {
    try {
        const header = buf.slice(0, 10).toString('ascii');
        if (!/^(\/9j\/|iVBOR|UklGR)/.test(header)) return null;
        const finalImg = Buffer.from(buf.toString('utf8'), 'base64');
        return isImageBuffer(finalImg) ? finalImg : null;
    } catch {
        return null;
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    const classes = CLASS_NAMES.map((name, i) => ({
        type_name: name,
        type_id: CLASS_IDS[i],
    }));
    const list = await fetchRecommend(inReq);
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = inReq.body.page || inReq.body.pg || 1;
    const extend = inReq.body.extend || {};
    return categoryContent(tid, pg, extend, inReq);
}

async function detail(inReq, _outResp) {
    const playUrl = String(inReq.body.id || '');
    const finalUrl = processPlayUrl(playUrl);
    return {
        list: [
            {
                vod_id: playUrl,
                vod_name: '视频',
                vod_pic: '',
                vod_content: '',
                vod_play_from: '播放',
                vod_play_url: `播放$${finalUrl}`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    return {
        parse: 0,
        url: id,
        header: { 'User-Agent': UA, Referer: `${host}/` },
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const result = await apiRequest('/pwa.php/api/MvSearch/video', {
        page: String(pg),
        size: '15',
        keyword: key,
    });
    const list = extractItems(result?.data).map((item) => mapVideoItem(item, inReq));
    return { list, page: pg, pagecount: 9999, limit: 24, total: 99999 };
}

async function proxyHandler(inReq, outResp) {
    if (inReq.query.type !== 'tbr_img') {
        return outResp.code(404).type('text/plain').send('not found');
    }

    try {
        let imgUrlB64 = decodeURIComponent(inReq.query.url || '');
        if (!imgUrlB64) return outResp.code(400).type('text/plain').send('missing url');

        const pad = (4 - (imgUrlB64.length % 4)) % 4;
        if (pad) imgUrlB64 += '='.repeat(pad);

        const imgUrl = Buffer.from(imgUrlB64, 'base64').toString('utf8');
        const r = await http.get(imgUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
                Referer: `${host}/`,
            },
            responseType: 'arraybuffer',
        });

        if (r.status !== 200) {
            log(`[proxy] 图片下载失败: HTTP ${r.status}`);
            return outResp.code(404).type('text/plain').send('image not found');
        }

        const encrypted = Buffer.from(r.data);
        const header = encrypted.slice(0, 10);
        if (header[0] === 0xff && header[1] === 0xd8) {
            return outResp.type('image/jpeg').send(encrypted);
        }
        if (header[0] === 0x89 && header[1] === 0x50) {
            return outResp.type('image/png').send(encrypted);
        }

        let decrypted;
        try {
            const decipher = crypto.createDecipheriv('aes-128-cbc', IMG_KEY, IMG_IV);
            decrypted = trimTrailingNull(Buffer.concat([decipher.update(encrypted), decipher.final()]));
        } catch (e) {
            log(`[proxy] 解密失败: ${e.message}`);
            return outResp.code(500).type('text/plain').send('decryption failed');
        }

        if (!decrypted.length) {
            return outResp.code(500).type('text/plain').send('decryption failed');
        }

        const b64Img = tryBase64Image(decrypted);
        const out = b64Img || decrypted;
        return outResp.type(detectImageType(out)).send(out);
    } catch (e) {
        log(`[proxy] 错误: ${e.message}`);
        return outResp.code(500).type('text/plain').send(String(e.message));
    }
}

export default {
    meta: {
        key: 'tbr',
        name: '🔥TBR',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
