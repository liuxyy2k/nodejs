import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const DEF_PIC = 'https://ghproxy.net/https://raw.githubusercontent.com/hjdhnx/hipy-server/master/app/static/img/lives.jpg';

const sources = [
    { name: 'IPTV', url: 'https://ipv.qq1000.site/IPTV.txt'                                                                    },
    { name: '范明明', url: 'https://cdn.jsdelivr.net/gh/fanmingming/live@refs/heads/main/tv/m3u/ipv6.m3u'                      },
    { name: '电视',  url: 'https://tv.iill.top/m3u/Gather'                                                                     },
    { name: '网络',  url: 'https://m.iill.top/Live.m3u'                                                                        },
    { name: '体育',  url: 'https://tv.iill.top/m3u/Sport'                                                                      },
    { name: '哔哩',  url: 'https://sub.ottiptv.cc/bililive.m3u'                                                                 },
    { name: '虎牙',  url: 'https://sub.ottiptv.cc/huyayqk.m3u'                                                                 },
    { name: '斗鱼',  url: 'https://sub.ottiptv.cc/douyuyqk.m3u'                                                                 },
    { name: 'YY',   url: 'https://sub.ottiptv.cc/yylunbo.m3u'                                                                  },
];

async function fetchText(url) {
    const resp = await axios.get(url, {
        headers:  { 'User-Agent': UA },
        timeout:  10000,
        responseType: 'text',
    });
    return resp.data;
}

// 解析 M3U 格式，返回 { groups: { groupName: [{name, url, logo}] } }
function parseM3u(text) {
    const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
    const groups = {};

    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#EXTINF')) continue;

        const info    = lines[i];
        const url     = lines[i + 1] || '';
        if (!url || url.startsWith('#')) continue;

        const nameMatch  = info.match(/,(.+)$/);
        const groupMatch = info.match(/group-title="([^"]*)"/i);
        const logoMatch  = info.match(/tvg-logo="([^"]*)"/i);

        const name  = nameMatch  ? nameMatch[1].trim()  : '未知';
        const group = groupMatch ? groupMatch[1].trim()  : '其他';
        const logo  = logoMatch  ? logoMatch[1].trim()   : '';

        if (!groups[group]) groups[group] = [];
        groups[group].push({ name, url, logo });
    }

    return groups;
}

// 解析 TXT 格式（频道名,url 或 group,#genre# 分组格式）
function parseTxt(text) {
    const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);
    const groups  = {};
    let curGroup  = '其他';

    for (const line of lines) {
        if (line.includes('#genre#')) {
            curGroup = line.replace('#genre#', '').replace(',', '').trim();
            continue;
        }
        const commaIdx = line.lastIndexOf(',');
        if (commaIdx === -1) continue;

        const name = line.substring(0, commaIdx).trim();
        const url  = line.substring(commaIdx + 1).trim();
        if (!url.startsWith('http')) continue;

        if (!groups[curGroup]) groups[curGroup] = [];
        groups[curGroup].push({ name, url, logo: '' });
    }

    return groups;
}

function parse(text, sourceUrl) {
    const isTxt = sourceUrl.endsWith('.txt') || (!text.includes('#EXTINF') && text.includes(','));
    return isTxt ? parseTxt(text) : parseM3u(text);
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    // 每个直播源作为一个分类
    const classes = sources.map(s => ({
        type_id:   s.name,
        type_name: s.name,
    }));
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id   = inReq.body.id;
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);

    const source = sources.find(s => s.name === id);
    if (!source) return { page, pagecount: 1, list: [] };

    const text   = await fetchText(source.url);
    const groups = parse(text, source.url);

    // 按组展示：每个 group 作为一个 vod 卡片，点进去看频道列表
    const list = Object.keys(groups).map(group => ({
        vod_id:      JSON.stringify({ source: id, group }),
        vod_name:    group,
        vod_pic:     DEF_PIC,
        vod_remarks: `${groups[group].length} 个频道`,
    }));

    return { page, pagecount: 1, list };
}

async function detail(inReq, _outResp) {
    const { source: sourceName, group } = JSON.parse(inReq.body.id);

    const source = sources.find(s => s.name === sourceName);
    if (!source) return { list: [] };

    const text    = await fetchText(source.url);
    const groups  = parse(text, source.url);
    const channels = groups[group] || [];

    // 每个频道作为一集
    const playUrls = channels.map(c => `${c.name}$${c.url}`).join('#');

    return {
        list: [{
            vod_id:        inReq.body.id,
            vod_name:      group,
            vod_pic:       DEF_PIC,
            vod_play_from: sourceName,
            vod_play_url:  playUrls,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const keyword = (inReq.body.wd || '').toLowerCase();
    if (!keyword) return { list: [] };

    const list = [];

    // 并发拉取所有源搜索
    await Promise.allSettled(sources.map(async source => {
        try {
            const text   = await fetchText(source.url);
            const groups = parse(text, source.url);

            for (const [group, channels] of Object.entries(groups)) {
                const matched = channels.filter(c => c.name.toLowerCase().includes(keyword));
                if (matched.length === 0) continue;

                const playUrls = matched.map(c => `${c.name}$${c.url}`).join('#');
                list.push({
                    vod_id:      JSON.stringify({ source: source.name, group }),
                    vod_name:    `[${source.name}] ${group}`,
                    vod_pic:     DEF_PIC,
                    vod_remarks: `${matched.length} 个频道`,
                    // 搜索结果直接带上匹配的频道
                    _play_url:   playUrls,
                });
            }
        } catch (e) {
            console.error(`[${source.name}] 拉取失败:`, e.message);
        }
    }));

    return { list };
}

export default {
    meta: { key: 'live2vod', name: '直播点播', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};