import axios from 'axios';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const DEF_PIC = 'https://ghproxy.net/https://raw.githubusercontent.com/hjdhnx/hipy-server/master/app/static/img/lives.jpg';

const sources = [
    { name: '库佬',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/Jsnzkpg/Jsnzkpg/Jsnzkpg/Jsnzkpg1.m3u'           },

    { name: '蚂蚁',  url: 'https://ge.html-5.me/ii/%E9%BB%84%E8%9A%82%E8%9A%81%E5%85%88%E9%94%8B%E6%8E%A8%E6%B5%81%E6%BA%90.txt' },
    { name: '松视',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/liuxyy2k/y2kspider/refs/heads/main/lives.txt' },
    { name: '松视2',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/lc529180405/caicai/c66fb081ac1db9f0fe82116a3d38f136466f904d/18txt/%E7%BA%AF%E5%8D%81%E5%85%AB.txt' },
    { name: '色播',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/cluntop/tvbox/refs/heads/main/lib/sbjh.m3u' },
    { name: '岛国',  url: 'https://proxy.api.030101.xyz/files.catbox.moe/49yydm.m3u' },
    { name: '监控',  url: 'https://raw.githubusercontent.com/wliqi495-create/jaychouqq/refs/heads/main/%E7%9B%91%E6%8E%A7.m3u' },
    { name: '女优库',  url: 'https://raw.githubusercontent.com/liuxyy2k/y2kspider/refs/heads/main/nyk.m3u' },
    { name: '18+',   url: 'https://gh-proxy.org/https://github.com/lc529180405/caicai/blob/c66fb081ac1db9f0fe82116a3d38f136466f904d/18txt/ss.txt' },
    { name: '港台大陆',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/FG/d2adea8e6de1b0c22e2d7a28f99a317445f586b1/%E6%B8%AF%E5%8F%B0%E5%A4%A7%E9%99%86' },
    { name: 'xxx资源',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/FG/d2adea8e6de1b0c22e2d7a28f99a317445f586b1/xxx%E8%A7%86%E9%A2%91%E8%B5%84%E6%BA%90' },
    { name: '女优1',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%981.m3u' },
    { name: '女优2',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%982.m3u' },
    { name: '女优3',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%983.m3u' },
    { name: '女优4',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%984.m3u' },
    { name: '女优5',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%985.m3u' },
    { name: '女优6',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%986.m3u' },
    { name: '女优7',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%987.m3u' },
    { name: '女优8',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%988.m3u' },
    { name: '女优9',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%989.m3u' },
    { name: '女优10',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%9810.m3u' },
    { name: '女优11',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%9811.m3u' },
    { name: '女优12',   url: 'https://gh-proxy.org/https://raw.githubusercontent.com/FGBLH/fgrjk/6b4b6eda6d080543af4529f8566283b65ab44760/%E6%97%A5%E6%9C%AC%E5%A5%B3%E4%BC%9812.m3u' },
    { name: '虎牙2',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/lalifeier/IPTV/1b775bcdb5aceb97bb1cecbac10e31ca7eb3d1d3/m3u/huya.m3u' },
    { name: '斗鱼2',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/lalifeier/IPTV/1b775bcdb5aceb97bb1cecbac10e31ca7eb3d1d3/m3u/douyu.m3u' },
    { name: 'Lives',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/lalifeier/IPTV/1b775bcdb5aceb97bb1cecbac10e31ca7eb3d1d3/m3u/Live.m3u' },
    { name: 'IPTV',  url: 'https://ipv.qq1000.site/IPTV.txt'                                                                        },
    { name: '雨呢IPTV',  url: 'https://gh-proxy.org/https://raw.githubusercontent.com/cluntop/tvbox/refs/heads/main/lib/iptv.m3u'  },
    { name: '范明明', url: 'https://cdn.jsdelivr.net/gh/fanmingming/live@refs/heads/main/tv/m3u/ipv6.m3u'                           },
    { name: '电视',  url: 'https://tv.iill.top/m3u/Gather'                                                                         },
    { name: '网络',  url: 'https://m.iill.top/Live.m3u'                                                                             },
    { name: '体育',  url: 'https://tv.iill.top/m3u/Sport'                                                                          },
    { name: '哔哩',  url: 'https://sub.ottiptv.cc/bililive.m3u'                                                                    },
    { name: '虎牙',  url: 'https://sub.ottiptv.cc/huyayqk.m3u'                                                                    },
    { name: '斗鱼',  url: 'https://sub.ottiptv.cc/douyuyqk.m3u'                                                                   },
    { name: 'YY',    url: 'https://sub.ottiptv.cc/yylunbo.m3u'                                                                     },
];

function solveAESChallenge(html) {
    const aMatch = html.match(/toNumbers\("([0-9a-f]+)"\),b=/);
    const bMatch = html.match(/,b=toNumbers\("([0-9a-f]+)"\),c=/);
    const cMatch = html.match(/,c=toNumbers\("([0-9a-f]+)"\)/);
    if (!aMatch || !bMatch || !cMatch) return null;

    const key        = Buffer.from(aMatch[1], 'hex');
    const iv         = Buffer.from(bMatch[1], 'hex');
    const ciphertext = Buffer.from(cMatch[1], 'hex');

    const decipher   = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    const decrypted  = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('hex');
}

async function fetchTextMaYi(url) {
    const headers = {
        'User-Agent':      UA,
        'Referer':         new URL(url).origin + '/',
        'Accept':          '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };

    // 第一次请求，可能拿到 AES 验证页
    const resp1 = await axios.get(url, { headers, responseType: 'text', maxRedirects: 0 });

    if (resp1.data?.includes('slowAES.decrypt')) {
        // 解出 cookie 值
        const cookieVal = solveAESChallenge(resp1.data);
        if (!cookieVal) throw new Error('AES challenge 解析失败');

        // 带 cookie 重新请求
        const resp2 = await axios.get(url + (url.includes('?') ? '&' : '?') + 'i=1', {
            headers: {
                ...headers,
                Cookie: `__test=${cookieVal}`,
            },
            responseType: 'text',
        });
        return resp2.data;
    }

    return resp1.data;
}

async function fetchText(url) {
    const resp = await axios.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer':    new URL(url).origin + '/',
        },
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
    const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
    const groups   = {};
    let   curGroup = '其他';

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

        if (!groups[curGroup]) groups[curGroup] = {};

        // 同名频道多个 URL 合并到一起
        if (!groups[curGroup][name]) {
            groups[curGroup][name] = { name, urls: [], logo: '' };
        }
        groups[curGroup][name].urls.push(url);
    }

    // 转成数组，url 取第一个，备用线路用 | 拼接备用
    const result = {};
    for (const [group, channels] of Object.entries(groups)) {
        result[group] = Object.values(channels).map(c => ({
            name: c.name,
            url:  c.urls[0],          // 主线路
            urls: c.urls,             // 全部备用
            logo: c.logo,
        }));
    }
    return result;
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
    let text   = await fetchTextMaYi(source.url);
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
    let text    = await fetchTextMaYi(source.url);
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
    meta: { key: 'live2vod', name: '🔥直播合集', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};