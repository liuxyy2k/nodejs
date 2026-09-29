import axios from 'axios';
import https from 'https';

const API = Buffer.from([
    104, 116, 116, 112, 115, 58, 47, 47, 97, 112, 105, 46, 109, 97, 114, 99, 104, 50, 52, 49, 54, 56, 46, 111, 110, 108, 105, 110, 101,
]).toString();
const CDN = Buffer.from([
    104, 116, 116, 112, 115, 58, 47, 47, 99, 100, 110, 46, 117, 97, 109, 101, 116, 97, 46, 97, 105, 47, 102, 105, 108, 101, 47, 98, 117, 99, 107, 101, 116, 45, 109, 101, 100, 105, 97,
]).toString();
const UA = 'Dart/3.11 (dart:io)';
const DEFAULT_LOGIN = Buffer.from([
    50, 56, 53, 56, 56, 54, 55, 53, 49, 64, 113, 113, 46, 99, 111, 109,
]).toString();
const DEFAULT_PASSWORD = Buffer.from([113, 119, 101, 114, 52, 51, 50, 49]).toString();

const AUTHORS = [
    ['FC2', 'FC2'],
    ['MOODYZ', "MOODYZ(Moody's)"],
    ['S1', 'S1 No. 1 Style'],
    ['加勒比', '加勒比'],
    ['一本道', '一本道'],
    ['麻豆传媒', '麻豆传媒'],
];


const http = axios.create({
    timeout: 25000,
    validateStatus: () => true,
    headers: {
        'user-agent': UA,
        'accept-encoding': 'gzip',
    },
});

let token = '';
let loginName = DEFAULT_LOGIN;
let password = DEFAULT_PASSWORD;
const items = new Map();

async function login() {
    if (token) return true;
    if (!loginName || !password) return false;
    try {
        const r = await http.post(`${API}/console/app/login`, null, {
            params: {
                loginName,
                password,
                platform: 'app',
            },
        });
        const data = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        const model = data.model || {};
        token = data.code === 0 ? model.token || '' : '';
        return Boolean(token);
    } catch (e) {
        console.log('[March] login:', e.message || e);
        return false;
    }
}

async function request(path, params = {}) {
    if (!(await login())) return null;
    try {
        const r = await http.get(`${API}${path}`, {
            params,
            headers: { token },
        });
        const data = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        if (data.code === 0) return data.model || {};
        if (r.status === 401 || r.status === 403) token = '';
        return null;
    } catch (e) {
        console.log('[March] request:', e.message || e);
        return null;
    }
}

function cover(item) {
    const c = item.coverUrl || item.cover || '';
    if (c.startsWith('http')) return c;
    return c.startsWith('/') ? CDN + c : '';
}

function toItem(item) {
    return {
        vod_id: String(item.id ?? ''),
        vod_name: item.title || item.number || '未命名视频',
        vod_pic: cover(item),
        vod_remarks: item.categories || item.tags || '',
    };
}

async function init(inReq, _outResp) {
    let extend = inReq.body?.extend || '';
    if (typeof extend === 'string' && extend) {
        try {
            extend = JSON.parse(extend);
        } catch {
            extend = {};
        }
    }
    if (extend && typeof extend === 'object') {
        if (extend.loginName) loginName = extend.loginName;
        if (extend.password) password = extend.password;
    }
    token = '';
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [{ type_id: 'video', type_name: '视频' }];
    AUTHORS.forEach(([name], index) => {
        classes.push({ type_id: `author:${index}`, type_name: name });
    });
    return { class: classes };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'video');
    const page = Math.max(1, parseInt(inReq.body.page, 10) || 1);
    const params = { orderType: 2, page, size: 50 };

    if (tid.startsWith('author:')) {
        try {
            const idx = parseInt(tid.split(':')[1], 10);
            params.searchType = 2;
            params.author = AUTHORS[idx][1];
        } catch {
            return { list: [], page, pagecount: 1, limit: 50, total: 0 };
        }
    }

    const model = await request('/video/app/video/search', params);
    if (!model) {
        return { list: [], page, pagecount: 1, limit: 50, total: 0 };
    }
    const data = model.data || [];
    for (const item of data) {
        items.set(String(item.id ?? ''), item);
    }
    return {
        list: data.map(toItem),
        page: model.currentPage ?? page,
        pagecount: model.totalPage ?? 1,
        limit: model.pageSize ?? 50,
        total: model.totalCount ?? 0,
    };
}

async function detail(inReq, _outResp) {
    const videoId = String(inReq.body.id || '');
    const item = items.get(videoId);
    if (!item) return { list: [] };
    const url = item.url || '';
    const vod = toItem(item);
    Object.assign(vod, {
        vod_content: item.brief || item.description || '',
        vod_actor: item.actress || item.authors || '',
        vod_play_from: '官方线路',
        vod_play_url: url ? `播放$${url}` : '',
    });
    return { list: [vod] };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id || '';
    if (!id) return { url: '' };
    return {
        parse: 0,
        url: id,
        header: { 'user-agent': UA },
    };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

export default {
    meta: {
        key: 'march',
        name: '🌸March视频',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
