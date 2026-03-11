import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const DEFAULT_JSON_URL = 'https://edgeone.gh-proxy.org/https://raw.githubusercontent.com/alantang1977/X/refs/heads/main/js/cj.json';
const DISK_TTL   = 3600 * 1000; // 1小时，毫秒
const CACHE_DIR  = path.join(os.homedir(), '.lz/cache');
const MAX_WORKERS = 60;

const ADULT_KWS = ['AV', '色', '福利', '成人', '18+', '偷拍', '自拍', '淫', '激情', 'GAY', 'SEX'];

const UNIVERSAL_FILTER = [{
    key: 'cateId', name: '分类',
    value: [
        { n: '全部',   v: '' },
        { n: '动作片', v: '动作' }, { n: '喜剧片', v: '喜剧' },
        { n: '爱情片', v: '爱情' }, { n: '科幻片', v: '科幻' },
        { n: '恐怖片', v: '恐怖' }, { n: '剧情片', v: '剧情' },
        { n: '战争片', v: '战争' }, { n: '国产剧', v: '国产' },
        { n: '港剧',   v: '香港' }, { n: '韩剧',   v: '韩国' },
        { n: '欧美剧', v: '欧美' }, { n: '台剧',   v: '台湾' },
        { n: '日剧',   v: '日本' }, { n: '纪录片', v: '记录' },
        { n: '动漫',   v: '动漫' }, { n: '综艺',   v: '综艺' },
    ],
}];

// ─── 状态（模块级，生命周期内复用） ────────────────────────────────────────

let sites       = [];
let memoryCache = {};  // 详情页内存缓存

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function md5(s) {
    return crypto.createHash('md5').update(s, 'utf8').digest('hex');
}

function ensureCacheDir() {
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
}

function getDiskCache(key) {
    try {
        const file = path.join(CACHE_DIR, `${md5(key)}.json`);
        const stat = fs.statSync(file);
        if (Date.now() - stat.mtimeMs < DISK_TTL) {
            return JSON.parse(fs.readFileSync(file, 'utf-8'));
        }
        fs.unlinkSync(file); // 过期删除
    } catch {}
    return null;
}

function setDiskCache(key, data) {
    try {
        if (!data?.list?.length) return;
        const file = path.join(CACHE_DIR, `${md5(key)}.json`);
        fs.writeFileSync(file, JSON.stringify(data), 'utf-8');
    } catch {}
}

function isAdult(name) {
    if (!name) return false;
    const upper = name.toUpperCase();
    if (upper.startsWith('AV')) return true;
    return ADULT_KWS.some(k => upper.includes(k));
}

function filterSites(all, mode) {
    if (mode === '0') return all;
    if (mode === '1') return all.filter(s => !isAdult(s.name));
    if (mode === '2') return all.filter(s => isAdult(s.name));
    return all;
}

async function fetchApi(apiUrl, params = {}, isSearch = false) {
    try {
        const timeout = isSearch ? 2000 : 4000;
        const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
        const sep = apiUrl.includes('?') ? '&' : '?';
        const url = qs ? `${apiUrl}${sep}${qs}` : apiUrl;
        const resp = await axios.get(url, {
            timeout,
            headers: { 'User-Agent': UA, 'Connection': 'keep-alive' },
        });
        return resp.data;
    } catch {
        return {};
    }
}

// ─── 初始化（加载站点配置） ────────────────────────────────────────────────

async function loadSites(extend) {
    let jsonPath = DEFAULT_JSON_URL;
    let mode     = '0';

    if (extend) {
        if (extend.includes('|')) {
            const parts = extend.split('|');
            jsonPath = parts[0] || DEFAULT_JSON_URL;
            mode     = parts[1] || '0';
        } else if (['0', '1', '2'].includes(extend)) {
            mode = extend;
        } else {
            jsonPath = extend;
        }
    }

    try {
        let data;
        if (jsonPath.startsWith('http://') || jsonPath.startsWith('https://')) {
            const resp = await axios.get(jsonPath, { timeout: 10000 });
            data = resp.data;
        } else if (fs.existsSync(jsonPath)) {
            data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        }
        if (data?.api_site) {
            sites = filterSites(data.api_site, mode);
        }
    } catch (e) {
        console.error('加载配置失败:', e.message);
    }
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    ensureCacheDir();
    memoryCache = {};
    const extend = inReq.body?.extend || '';
    await loadSites(extend);
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [];
    const filters = {};
    sites.forEach((s, i) => {
        const id   = String(i);
        const name = (s.name || `站点${i}`).replace('TV-', '').replace('AV-', '');
        classes.push({ type_id: id, type_name: name });
        filters[id] = UNIVERSAL_FILTER;
    });
    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const tid       = inReq.body.id;
    const pg        = inReq.body.page || 1;
    const ext       = inReq.body.filters || {};
    const cateIdVal = ext.cateId || '';
    const cacheKey  = `CAT_${tid}_${pg}_${cateIdVal}`;

    // 读缓存
    const cached = getDiskCache(cacheKey);
    if (cached) return cached;

    try {
        const idx  = parseInt(tid);
        if (idx >= sites.length) return { list: [] };
        const site = sites[idx];
        const paichu = new Set((String(site.paichu || '')).split(',').filter(Boolean));

        const data     = await fetchApi(site.api, { ac: 'detail', pg });
        const list     = [];

        for (const item of (data?.list || [])) {
            if (paichu.has(String(item.type_id))) continue;
            if (cateIdVal && !((item.type_name || '').includes(cateIdVal))) continue;
            item.vod_id = `${idx}@@${item.vod_id}`;
            list.push(item);
        }

        const result = {
            page:      parseInt(data?.page  || 1),
            pagecount: parseInt(data?.pagecount || 1),
            limit:     20,
            total:     parseInt(data?.total || 0),
            list,
        };
        setDiskCache(cacheKey, result);
        return result;
    } catch {
        return { list: [] };
    }
}

async function detail(inReq, _outResp) {
    const vodIdFull = String(inReq.body.id || '');
    if (!vodIdFull) return { list: [] };

    // 内存缓存
    if (memoryCache[vodIdFull]) return memoryCache[vodIdFull];
    if (!vodIdFull.includes('@@')) return { list: [] };

    try {
        const [idxStr, vid] = vodIdFull.split('@@');
        const site = sites[parseInt(idxStr)];
        const data = await fetchApi(site.api, { ac: 'detail', ids: vid });
        if (data?.list?.length) {
            const item = data.list[0];
            item.vod_id = vodIdFull;
            const result = { list: [item] };
            memoryCache[vodIdFull] = result;
            return result;
        }
    } catch {}
    return { list: [] };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id || '';
    const isDirect = /\.(m3u8|mp4)/i.test(id);
    return {
        url:    id,
        header: { 'User-Agent': UA },
        parse:  isDirect ? 0 : 1,
        jx:     0,
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    if (!key) return { list: [] };

    // 读缓存
    const cacheKey = `SEARCH_${key}`;
    const cached   = getDiskCache(cacheKey);
    if (cached) return cached;

    // 准备并发目标
    const targets = sites
        .map((s, i) => ({ i, s }))
        .filter(({ s }) => String(s.bz ?? '1').trim() !== '0' && s.api);

    // 并发搜索（限制 MAX_WORKERS 并发）
    const tempResults = {};

    async function searchOne({ i, s }) {
        try {
            const paichu   = new Set((String(s.paichu || '')).split(',').filter(Boolean));
            const data     = await fetchApi(s.api, { ac: 'detail', wd: key }, true);
            const siteName = (s.name || '').replace('TV-', '').replace('AV-', '');
            const local    = [];
            for (const item of (data?.list || [])) {
                if (paichu.has(String(item.type_id))) continue;
                item.vod_name = `[${siteName}] ${item.vod_name}`;
                item.vod_id   = `${i}@@${item.vod_id}`;
                local.push(item);
            }
            if (local.length) tempResults[i] = local;
        } catch {}
    }

    // 分批并发（每批 MAX_WORKERS 个）
    for (let i = 0; i < targets.length; i += MAX_WORKERS) {
        const batch = targets.slice(i, i + MAX_WORKERS);
        await Promise.allSettled(batch.map(t => searchOne(t)));
    }

    // 按原始顺序聚合
    const finalList = Object.keys(tempResults)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap(idx => tempResults[idx]);

    const result = { list: finalList };
    setDiskCache(cacheKey, result);
    return result;
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'cjjson',
        name: '采集聚合',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};