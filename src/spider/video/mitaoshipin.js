import axios from 'axios';
import crypto from 'crypto';

// ─── 站点配置 ─────────────────────────────────────────────────────────────────

const SITES = [
    { name: 'nht966',    host: 'https://www.nht966hht.vip:9527' },
    { name: 'httre666', host: 'https://www.newhttestre666.cc'   },
];

const SIGN_KEY   = 'opum3_Loily$SV^6H';
const BUNDLE_ID  = 'com.ht9.web20.video';
const BRAND_ID   = 'hongtao';
const VERSION    = '1.0.0';
const PROJECT_ID = '1';
const TIMEOUT    = 10_000;
const PROXY_TYPE = 'mitao_img';

const CATEGORY_BLACKLIST = new Set(['成人游戏','漫画','小说','蜜穴女友','一键脱衣','春药商城','同城交友','吃瓜','成人漫画']);

// ─── 运行时状态 ───────────────────────────────────────────────────────────────

let hostUrl        = SITES[0].host;
let userId         = '';
let sessionId      = '';
let deviceId       = '';
let sessionInited  = false;
let categories     = [];
let videoTypeList  = [];

// 简单内存缓存
const aggCache     = new Map();

const http = axios.create({
    timeout:  TIMEOUT,
    headers: {
        'User-Agent':    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept:          'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        lang:            'cn',
        deviceType:      'H5-android',
    },
});

// ─── AES ZeroPadding ──────────────────────────────────────────────────────────

function zeroPad(buf, blockSize = 16) {
    const pad = blockSize - (buf.length % blockSize);
    return pad === blockSize ? buf : Buffer.concat([buf, Buffer.alloc(pad)]);
}

function aesEncrypt(plaintext, keyStr, ivStr) {
    const key    = Buffer.from(keyStr, 'utf-8');
    const iv     = Buffer.from(ivStr,  'utf-8');
    const data   = zeroPad(Buffer.from(plaintext, 'utf-8'));
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('base64');
}

function aesDecrypt(b64, keyStr, ivStr) {
    const key     = Buffer.from(keyStr, 'utf-8');
    const iv      = Buffer.from(ivStr,  'utf-8');
    const cleaned = b64.replace(/\s/g, '');
    const enc     = Buffer.from(cleaned, 'base64');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf-8').replace(/\0+$/, '');
}

// ─── 签名 & 密钥 ──────────────────────────────────────────────────────────────

function genKey(timestamp) {
    const ts = String(timestamp);
    return ts.slice(-6) + SIGN_KEY.slice(0, 4) + BUNDLE_ID.slice(0, 6);
}

function genIv() {
    return BUNDLE_ID.slice(-6) + SIGN_KEY.slice(-4) + (deviceId || '').slice(0, 6);
}

function generateSign(params, apiPath) {
    const sorted = Object.keys(params).sort();
    const concat = sorted.map((k) => String(params[k])).join('');
    const raw    = concat + SIGN_KEY + apiPath;
    return crypto.createHash('md5').update(raw, 'utf-8').digest('hex').toUpperCase();
}

function generateDeviceId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let rand = '';
    for (let i = 0; i < 32; i++) rand += chars[Math.floor(Math.random() * chars.length)];
    return 'H5-' + rand;
}

// ─── 通用请求 ─────────────────────────────────────────────────────────────────

function commonParams() {
    const hostname = hostUrl.replace(/^https?:\/\//, '');
    return {
        timezone:   'Asia/Karachi',
        version:    VERSION,
        channelId:  67,
        channelId2: hostname,
        brandId:    BRAND_ID,
    };
}

async function apiRequest(endpoint, params = {}, skipEncrypt = false, _t = null) {
    const timestamp = _t ? String(_t) : String(Date.now());
    const keyStr    = genKey(timestamp);
    const ivStr     = genIv();

    const full = { ...commonParams(), t: timestamp, ...params };
    full.sign  = generateSign(full, endpoint);

    const url     = hostUrl + endpoint;
    const headers = {
        ...http.defaults.headers,
        t:        timestamp,
        deviceId: deviceId || '',
        bundleId: BUNDLE_ID,
    };
    if (userId)    headers.userId    = userId;
    if (sessionId) headers.sessionId = sessionId;

    let body;
    if (skipEncrypt) {
        body = JSON.stringify(full);
        headers['Content-Type'] = 'application/json';
        headers['encrypt']      = 'false';
    } else {
        body = aesEncrypt(JSON.stringify(full), keyStr, ivStr);
        headers['Content-Type'] = 'text/plain';
        headers['encrypt']      = 'true';
    }

    try {
        const { data: resp } = await http.post(url, body, { headers });
        if (resp?.code === 10000 && typeof resp?.data === 'string' && resp.data) {
            try {
                resp.data = JSON.parse(aesDecrypt(resp.data, keyStr, ivStr));
            } catch { /* ignore */ }
        }
        return resp;
    } catch {
        return null;
    }
}

// ─── 会话初始化 ───────────────────────────────────────────────────────────────

async function ensureSession() {
    if (sessionInited) return;
    if (!deviceId) deviceId = generateDeviceId();

    // appConfig
    const appcfg = await apiRequest('/ht/users/appConfig');
    if (appcfg?.code === 10000) {
        const ac = appcfg.data?.appConfig;
        if (ac?.videoTypeList) videoTypeList = ac.videoTypeList;
    }

    // initH5_1 + initH5_2 共用时间戳
    const sharedT = Date.now();
    const resp1   = await apiRequest('/ht/users/initH5_1', {}, false, sharedT);
    if (resp1?.code === 10000) {
        if (resp1.data?.deviceId)     deviceId   = resp1.data.deviceId;
        if (resp1.data?.typeTitleList) categories = resp1.data.typeTitleList;
    }
    await apiRequest('/ht/users/initH5_2', {}, false, sharedT);

    // deviceLogin
    const resp = await apiRequest('/ht/users/deviceLogin', {
        bundleId: BUNDLE_ID, brandId: BRAND_ID, projectId: PROJECT_ID,
    });
    if (resp?.code === 10000) {
        userId    = resp.data?.userId    || '';
        sessionId = resp.data?.sessionId || '';
    }

    sessionInited = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(seconds) {
    const s = parseInt(seconds || 0);
    if (!s) return '';
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
}

function tryGet(item, ...keys) {
    for (const k of keys) {
        const v = item[k];
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return '';
}

function proxyImgUrl(imgUrl, proxyBase) {
    if (!imgUrl) return '';
    return proxyBase ? `${proxyBase}&type=${PROXY_TYPE}&url=${encodeURIComponent(imgUrl)}` : imgUrl;
}

function parseVideo(item, proxyBase) {
    if (item?.contentType !== 1) return null;
    const vid     = String(item.contentId || item.id || item.videoId || '');
    const title   = item.title || item.name || item.videoTitle || '';
    const pic     = item.img || item.cover || item.coverUrl || item.pic || item.imageUrl || '';
    let   remarks = item.duration || item.playCount || item.remark || '';
    if (remarks && String(remarks).match(/^\d+$/)) remarks = fmtDuration(remarks);
    if (!vid) return null;
    return {
        vod_id:      vid,
        vod_name:    title,
        vod_pic:     proxyImgUrl(pic, proxyBase),
        vod_remarks: String(remarks || ''),
    };
}

function extractVideosFromData(data, proxyBase) {
    const items = Array.isArray(data) ? data
        : (data?.videoList || data?.list || data?.data || data?.videos || data?.typeVideoList
           || data?.searchList || data?.contentList || data?.records || data?.pageData || []);
    if (!Array.isArray(items)) return [];
    return items.map((v) => parseVideo(v, proxyBase)).filter(Boolean);
}

function parseActorList(data, proxyBase) {
    const items = Array.isArray(data) ? data
        : (data?.actorList || data?.actors || data?.list || data?.data || []);
    if (!Array.isArray(items)) return [];
    const seen = new Set(), results = [];
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const actorId   = String(tryGet(item, 'actorId','contentId','id','artId','actor_id','userId') || '');
        const actorName = String(tryGet(item, 'actorName','name','title','artName','actor_name','actor') || '');
        const actorImg  = String(tryGet(item, 'actorPic','actorImg','img','avatar','cover','imageUrl','headImg','head','photo','image','pic','actor_img') || '');
        const count     = String(tryGet(item, 'videoCount','contentCount','count','totalCount','total','video_count') || '');
        if (!actorId || seen.has(actorId)) continue;
        seen.add(actorId);
        results.push({
            vod_id:      `actor_${actorId}@`,
            vod_name:    actorName || `演员${actorId}`,
            vod_pic:     proxyImgUrl(actorImg || hostUrl + '/favicon.ico', proxyBase),
            vod_tag:     'folder',
            vod_remarks: count ? `${count}部` : '',
        });
    }
    return results;
}

function parseTopicList(data, proxyBase) {
    const items = Array.isArray(data) ? data
        : (data?.topicList || data?.oriTopicList || data?.list || data?.data || data?.topics || []);
    if (!Array.isArray(items)) return [];
    const seen = new Set(), results = [];
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const topicId   = String(tryGet(item, 'topicId','id','contentId','oriTopicId','topic_id') || '');
        const topicName = String(tryGet(item, 'topicName','name','title','oriTopicName','topic_name','topic') || '');
        const topicImg  = String(tryGet(item, 'topicPic','topicImg','img','cover','imageUrl','pic','thumb','image','topic_img','oriTopicImg') || '');
        const count     = String(tryGet(item, 'videoCount','count','contentCount','totalCount','total','video_count') || '');
        if (!topicId || seen.has(topicId)) continue;
        seen.add(topicId);
        results.push({
            vod_id:      `topic_${topicId}@`,
            vod_name:    topicName || `专题${topicId}`,
            vod_pic:     proxyImgUrl(topicImg || hostUrl + '/favicon.ico', proxyBase),
            vod_tag:     'folder',
            vod_remarks: count ? `${count}部` : '',
        });
    }
    return results;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

function getProxyBase(inReq) {
    const prefix = inReq.server?.prefix || '';
    return `http://localhost:9988${prefix}/proxy`;
}

async function home(inReq, _outResp) {
    await ensureSession();
    const proxyBase = getProxyBase(inReq);

    const classes = [];
    const filters = {};

    for (const cat of categories) {
        const cid   = String(cat.contentId || '');
        const title = cat.title || '';
        if (!cid || !title || CATEGORY_BLACKLIST.has(title)) continue;
        classes.push({ type_id: cid, type_name: title });

        const catFilters = [];
        const subCats    = videoTypeList.filter((v) => String(v.typePid) === cid);
        if (subCats.length) {
            const subVals = [{ n: '全部', v: '' }, ...subCats.map((sc) => ({ n: sc.typeName, v: String(sc.typeId) })).filter((x) => x.n && x.v)];
            if (subVals.length > 1) catFilters.push({ key: 'label', name: '分类', value: subVals });
        }
        const first = videoTypeList.find((v) => String(v.typePid) === '0' && String(v.typeId) === cid);
        if (first?.tags) {
            const tagList = first.tags.split(',').map((t) => t.trim()).filter(Boolean);
            if (tagList.length) {
                catFilters.push({ key: 'tag', name: '标签', value: [{ n: '全部', v: '' }, ...tagList.map((t) => ({ n: t, v: t }))] });
            }
        }
        catFilters.push({ key: 'sort', name: '排序', value: [{ n: '最近更新', v: '0' }, { n: '最多播放', v: '1' }, { n: '最多收藏', v: '2' }] });
        if (catFilters.length) filters[cid] = catFilters;
    }

    classes.push({ type_id: 'actor', type_name: '女优' });
    filters['actor'] = [
        { key: 'height',   name: '身高', value: [{ n: '身高', v: '' }, ...Array.from({ length: 15 }, (_, i) => ({ n: `${150 + i}cm`, v: String(150 + i) }))] },
        { key: 'cup',      name: '罩杯', value: [{ n: '罩杯', v: '' }, ...'ABCDEFG'.split('').map((c) => ({ n: `${c}罩杯`, v: c }))] },
        { key: 'birthday', name: '年龄', value: [{ n: '年龄', v: '' }, ...Array.from({ length: 27 }, (_, i) => ({ n: `${2002 - i}年`, v: String(2002 - i) }))] },
        { key: 'debut',    name: '出道', value: [{ n: '出道', v: '' }, ...Array.from({ length: 25 }, (_, i) => ({ n: `${2025 - i}年`, v: String(2025 - i) }))] },
    ];
    classes.push({ type_id: 'topic', type_name: '专题' });

    const homeData = await category({ body: { id: 'home', page: 1, extend: {} }, server: inReq.server }, null);
    return { class: classes, filters, list: homeData.list || [], page: homeData.page || 1, pagecount: homeData.pagecount || 1, limit: homeData.limit || 0, total: homeData.total || 0 };
}

async function category(inReq, _outResp) {
    await ensureSession();
    const tid       = String(inReq.body.id);
    const pg        = parseInt(inReq.body.page) || 1;
    const extend    = inReq.body.extend || {};
    const proxyBase = getProxyBase(inReq);

    // @ folder 模式
    if (tid.includes('@')) {
        const realTid = tid.replace('@', '');
        if (realTid.startsWith('actor_')) {
            const actorId  = realTid.slice('actor_'.length);
            const det      = await apiRequest('/ht/content/queryActorDetail', { actorId });
            const actorName = det?.data?.actorDetail?.actorName || det?.data?.actorName || '';
            let resp;
            if (actorName) {
                resp = await apiRequest('/ht/content/search', { keywords: actorName, pageNo: String(pg - 1), pageSize: '20' });
            } else {
                resp = await apiRequest('/ht/content/queryTypeVideosH5', { actorId, pageNo: String(pg - 1), pageSize: '20', type: '1' });
            }
            if (!resp || resp.code !== 10000) return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
            const data = resp.data || {};
            const list = extractVideosFromData(data, proxyBase);
            const totalPage = parseInt(data.totalPage || data.total_page || 1);
            return { list, page: pg, pagecount: Math.max(totalPage, 1), limit: list.length, total: Math.max(totalPage, 1) * 20 };
        }
        if (realTid.startsWith('topic_')) {
            const topicId = realTid.slice('topic_'.length);
            const resp    = await apiRequest('/ht/content/queryOriTopicVideos', { topicId, pageNo: String(pg - 1), pageSize: '20' });
            if (!resp || resp.code !== 10000) return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
            const data = resp.data || {};
            const list = extractVideosFromData(data, proxyBase);
            const totalPage = parseInt(data.totalPage || data.total_page || 1);
            return { list, page: pg, pagecount: Math.max(totalPage, 1), limit: list.length, total: Math.max(totalPage, 1) * 20 };
        }
        return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    }

    if (tid === 'actor') {
        const apiParams = { pageNo: String(pg - 1), pageSize: '20' };
        const filterMap = { height: 'actorHeight', cup: 'cupSize', birthday: 'actorBirthday', debut: 'actorDebut' };
        for (const [ek, ak] of Object.entries(filterMap)) { if (extend[ek]) apiParams[ak] = extend[ek]; }
        const resp = await apiRequest('/ht/content/getActors', apiParams);
        if (!resp || resp.code !== 10000) return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
        const data = resp.data || {};
        const list = parseActorList(data, proxyBase);
        const totalPage = parseInt(data.totalPage || 1);
        return { list, page: pg, pagecount: totalPage, limit: list.length, total: totalPage * 20 };
    }

    if (tid === 'topic') {
        const resp = await apiRequest('/ht/content/getOriTopicList', { pageNo: String(pg - 1), pageSize: '20' });
        if (!resp || resp.code !== 10000) return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
        const data = resp.data || {};
        const list = parseTopicList(data, proxyBase);
        return { list, page: pg, pagecount: 50, limit: list.length, total: list.length * 50 };
    }

    // home / new / hot / 数值分类
    const sortMap   = { home: '1', new: '1', hot: '2' };
    const apiParams = { pageNo: String(pg - 1), pageSize: '20', type: '1' };
    if (['home', 'new', 'hot'].includes(tid)) {
        apiParams.sort = sortMap[tid];
    } else {
        apiParams.typeId = tid;
        for (const key of ['label', 'tag', 'sort']) { if (extend[key]) apiParams[key] = extend[key]; }
    }

    const resp = await apiRequest('/ht/content/queryTypeVideosH5', apiParams);
    if (!resp || resp.code !== 10000) return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    const data      = resp.data || {};
    const items     = data.typeVideoList || data.list || data.data || data.videoList || [];
    const list      = items.map((v) => parseVideo(v, proxyBase)).filter(Boolean);
    const totalPage = parseInt(data.totalPage || 1);
    return { list, page: pg, pagecount: totalPage, limit: list.length, total: totalPage * 20 };
}

async function detail(inReq, _outResp) {
    await ensureSession();
    const did       = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const proxyBase = getProxyBase(inReq);

    const resp = await apiRequest('/ht/content/detail', { contentId: String(did) });
    if (!resp || resp.code !== 10000 || !resp.data) return { list: [] };

    const d       = resp.data;
    const title   = d.title || d.name || d.videoTitle || '未知标题';
    const pic     = d.cover || d.coverUrl || d.img || d.imageUrl || '';
    const desc    = d.description || d.desc || d.intro || '';
    const actor   = d.actor || d.actors || '';
    const playUrl = d.videoUrl || d.playUrl || d.url || d.m3u8Url || d.sl || '';

    return {
        list: [{
            vod_id:        String(did),
            vod_name:      title,
            vod_pic:       proxyImgUrl(pic, proxyBase),
            vod_actor:     String(actor),
            vod_director:  '',
            vod_content:   desc,
            vod_remarks:   fmtDuration(d.duration),
            vod_play_from: '蜜桃视频',
            vod_play_url:  playUrl ? `播放$${playUrl}` : `播放$${did}`,
        }],
    };
}

async function play(inReq, _outResp) {
    let url = (inReq.body.id || '').split('$').pop();
    if (url.startsWith('http')) {
        return { parse: 0, url, jx: 0, header: { 'User-Agent': http.defaults.headers['User-Agent'], Referer: hostUrl + '/' } };
    }

    await ensureSession();
    const resp = await apiRequest('/ht/content/detail', { contentId: url });
    if (!resp || resp.code !== 10000) return { parse: 0, url: '', jx: 0 };
    const d       = resp.data || {};
    const playUrl = d.videoUrl || d.playUrl || d.url || d.m3u8Url || d.sl || '';
    return { parse: 0, url: playUrl, jx: 0, header: { 'User-Agent': http.defaults.headers['User-Agent'], Referer: hostUrl + '/' } };
}

async function search(inReq, _outResp) {
    await ensureSession();
    const key       = inReq.body.wd || '';
    const pg        = parseInt(inReq.body.pg) || 1;
    const proxyBase = getProxyBase(inReq);

    const resp = await apiRequest('/ht/content/search', { keywords: key, pageNo: pg - 1, pageSize: 20 });
    if (!resp || resp.code !== 10000) return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };

    const data      = resp.data || {};
    const items     = Array.isArray(data) ? data
        : (data.searchList || data.list || data.data || data.videoList || data.records || data.resultList || data.content || []);
    const list      = items.map((v) => parseVideo(v, proxyBase)).filter(Boolean);
    const totalPage = parseInt(data.totalPage || 1);
    return { list, page: pg, pagecount: totalPage, limit: list.length, total: totalPage * 20 };
}

async function proxyHandler(inReq, outResp) {
    try {
        const { type, url: imgUrl } = inReq.query;
        if (type !== PROXY_TYPE || !imgUrl) return outResp.status(400).send('missing url');

        const decoded = decodeURIComponent(imgUrl);
        const { data } = await http.get(decoded, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': http.defaults.headers['User-Agent'], Referer: hostUrl + '/' },
        });

        let buf = Buffer.from(data);
        // XOR 0x88 解密
        if (!(buf[0] === 0xff && buf[1] === 0xd8) && buf.slice(0, 4).toString('hex') !== '89504e47') {
            const decoded2 = buf.map((b) => b ^ 0x88);
            if ((decoded2[0] === 0xff && decoded2[1] === 0xd8) || decoded2.slice(0, 4).toString('hex') === '89504e47') {
                buf = decoded2;
            }
        }

        let mime = 'image/jpeg';
        if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
        else if (buf.slice(0, 4).toString('hex') === '89504e47') mime = 'image/png';
        else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') mime = 'image/webp';

        return outResp.status(200).type(mime).send(buf);
    } catch {
        return outResp.status(500).send('proxy error');
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: { key: 'mitaosp', name: '🔥蜜桃视频', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.get('/proxy',     proxyHandler);
    },
};