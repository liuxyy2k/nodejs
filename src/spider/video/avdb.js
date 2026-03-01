import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA   = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const api  = 'https://avdbapi.com/api.php/provide/vod';

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers },
        httpsAgent:agent
    });
    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
}

function buildCard(e) {
    return {
        vod_id:      `${e.id}`,
        vod_name:    e.name,
        vod_pic:     e.poster_url || '',
        vod_remarks: e.tag || '',
    };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const data    = await request(api);
    const classes = (data.class || []).map(e => ({
        type_id:   `${e.type_id}`,
        type_name: e.type_name,
    }));

    // 首页推荐取第一页列表
    const first = await request(`${api}?ac=detail&pg=1`);
    const list  = (first.list || []).map(buildCard);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const data = await request(`${api}?t=${tid}&ac=detail&pg=${page}`);
    const list = (data.list || []).map(buildCard);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const data = await request(`${api}?ac=detail&ids=${id}`);
    const vod  = data.list?.[0];
    if (!vod) return { list: [] };
    const embedUrl   = vod.episodes?.server_data?.Full?.link_embed || '';
    const serverName = vod.episodes?.server_name || '播放';
    return {
        list: [{
            vod_id:        id,
            vod_name:      vod.name || '',
            vod_pic:       vod.poster_url || '',
            vod_remarks:   vod.tag || '',
            vod_play_from: serverName,
            vod_play_url:  `播放$${embedUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    let playUrl = ''
    try {
        const resp = await axios.get(url, {
            headers: { 'User-Agent': UA, 'Referer': 'https://avdbapi.com/' },
        });
        
        const html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        const m3u8 = html.match(/m3u8:\s*["']([^"']+)["']/)?.[1] || '';
        const aboutlink  = html.match(/aboutlink:\s*["']([^"']+)["']/)?.[1] || '';
        if (aboutlink && m3u8) playUrl = aboutlink + m3u8;
    
    } catch (e) {
        console.error('embed parse error:', e.message);
    }
    return {
        parse: 0,
        playUrl,
        header: {
            'User-Agent': UA,
            'Referer': `${url}/`
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const data = await request(`${api}?ac=detail&wd=${text}&pg=${page}`);
    const list = (data.list || []).map(buildCard);

    return { list };
}

export default {
    meta: {
        key: 'avdb',
        name: 'AVdb',
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