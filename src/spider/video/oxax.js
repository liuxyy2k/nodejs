import axios from 'axios';
import { config } from './config.js';

const site = 'http://oxax.tv';

const SERVER_API = config.SERVER_API;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent':      UA,
        Referer:           site,
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
});

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: {
            'User-Agent':      UA,
            Referer:           site,
            Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        httpsAgent: agent
    });
    return resp.data;
}

// ─── 频道列表 ─────────────────────────────────────────────────────────────────

const ALL_CHANNELS = [
    { title: 'ОХ-АХ HD',              href: '/oh-ah.html'              },
    { title: 'CineMan XXX HD',         href: '/sl-hot1.html'            },
    { title: 'CineMan XXX2 HD',        href: '/sl-hot2.html'            },
    { title: 'Brazzers TV Europe',     href: '/brazzers-tv-europe.html' },
    { title: 'Brazzers TV',            href: '/brazzers-tv.html'        },
    { title: 'Red Lips',               href: '/red-lips.html'           },
    { title: 'KinoXXX',               href: '/kino-xxx.html'           },
    { title: 'XY Max HD',              href: '/xy-max-hd.html'          },
    { title: 'XY Plus HD',             href: '/xy-plus-hd.html'         },
    { title: 'XY Mix HD',              href: '/xy-mix-hd.html'          },
    { title: 'Barely legal',           href: '/barely-legal.html'       },
    { title: 'Playboy TV',             href: '/playboy-tv.html'         },
    { title: 'Vivid Red HD',           href: '/vivid-red.html'          },
    { title: 'Exxxotica HD',           href: '/hot-pleasure.html'       },
    { title: 'Babes TV',               href: '/babes-tv.html'           },
    { title: 'Русская ночь',           href: '/russkaya-noch.html'      },
    { title: 'Pink O TV',              href: '/pink-o.html'             },
    { title: 'Erox HD',                href: '/erox-hd.html'            },
    { title: 'Eroxxx HD',              href: '/eroxxx-hd.html'          },
    { title: 'Hustler HD',             href: '/hustler-hd.html'         },
    { title: 'Private TV',             href: '/private-tv.html'         },
    { title: 'Redlight HD',            href: '/redlight-hd.html'        },
    { title: 'Penthouse Gold HD',      href: '/penthouse-gold.html'     },
    { title: 'Penthouse Quickies',     href: '/penthouse-2.html'        },
    { title: 'O-la-la',               href: '/o-la-la.html'            },
    { title: 'Blue Hustler',           href: '/blue-hustler.html'       },
    { title: 'Шалун',                 href: '/shalun.html'             },
    { title: 'Dorcel TV',              href: '/dorcel-tv.html'          },
    { title: 'Extasy HD',              href: '/extasyhd.html'           },
    { title: 'XXL',                    href: '/xxl.html'                },
    { title: 'FAP TV 2',              href: '/fap-tv-2.html'           },
    { title: 'FAP TV 3',              href: '/fap-tv-3.html'           },
    { title: 'FAP TV 4',              href: '/fap-tv-4.html'           },
    { title: 'FAP TV Parody',         href: '/fap-tv-parody.html'      },
    { title: 'FAP TV Compilation',    href: '/fap-tv-compilation.html' },
    { title: 'FAP TV Anal',           href: '/fap-tv-anal.html'        },
    { title: 'FAP TV Teens',          href: '/fap-tv-teens.html'       },
    { title: 'FAP TV Lesbian',        href: '/fap-tv-lesbian.html'     },
    { title: 'FAP TV BBW',            href: '/fap-tv-bbw.html'         },
    { title: 'FAP TV Trans',          href: '/fap-tv-trans.html'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_MAP = {
    brazzers:  'FFD700', playboy:  'FF69B4', hustler: 'DC143C',
    penthouse: '9370DB', vivid:    'FF1493', private: '8B008B',
    dorcel:    'FF6347', cineman:  '4169E1', fap:     'FF4500',
    xy:        'DA70D6', erox:     'FF00FF', kino:    '8A2BE2',
};

function getChannelImage(title) {
    const lower = title.toLowerCase();
    let color   = '1E90FF';
    for (const [key, col] of Object.entries(COLOR_MAP)) {
        if (lower.includes(key)) { color = col; break; }
    }
    const text = encodeURIComponent(title.slice(0, 20));
    return `https://via.placeholder.com/400x225/${color}/FFFFFF?text=${text}`;
}

function absUrl(url) {
    if (!url)               return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//'))   return 'http:' + url;
    if (url.startsWith('/'))    return site + url;
    return url;
}

function formatChannel(ch) {
    return {
        vod_id:      ch.href,
        vod_name:    ch.title,
        vod_pic:     getChannelImage(ch.title),
        vod_remarks: '直播',
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: 'all', type_name: '全部频道' },
            { type_id: 'hd',  type_name: 'HD频道'  },
            { type_id: 'fap', type_name: 'FAP系列'  },
        ],
        list:    ALL_CHANNELS.map(formatChannel),
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;
    const size = 30;

    const filtered = tid === 'hd'  ? ALL_CHANNELS.filter((c) => c.title.toUpperCase().includes('HD'))
                   : tid === 'fap' ? ALL_CHANNELS.filter((c) => c.title.toUpperCase().includes('FAP'))
                   : ALL_CHANNELS;

    const start = (pg - 1) * size;
    const list  = filtered.slice(start, start + size).map(formatChannel);

    return {
        page:      pg,
        pagecount: Math.max(1, Math.ceil(filtered.length / size)),
        limit:     size,
        total:     filtered.length,
        list,
    };
}

async function detail(inReq, _outResp) {
    const href      = inReq.body.id;
    const detailUrl = absUrl(href);

    // 从列表查找真实标题
    const ch    = ALL_CHANNELS.find((c) => c.href === href);
    const title = ch?.title
               || href.replace('.html', '').replace('/', '').replace(/-/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase());

    return {
        list: [{
            vod_id:        href,
            vod_name:      title,
            vod_pic:       getChannelImage(title),
            vod_remarks:   '直播',
            vod_content:   '成人电视直播频道',
            vod_play_from: 'OXAX',
            vod_play_url:  `${title}$${detailUrl}`,
        }],
    };
}

function decodePlayerjs(input) {
  // 1. 去掉 # 和开头的 F
  let s = input.replace(/^[#F]+/, '');

  // 2. 两段分别解码再拼成原始字节
  const eqIdx = s.indexOf('==');
  let raw;
  if (eqIdx !== -1 && eqIdx < s.length - 2) {
    const decA = Buffer.from(s.slice(0, eqIdx), 'base64');
    const decB = Buffer.from(s.slice(eqIdx + 2), 'base64');
    raw = Buffer.concat([decA, decB]);
  } else {
    raw = Buffer.from(s, 'base64');
  }

  // 3. 遇到第一个非ASCII字节就截断（网站故意塞的乱码）
  let badStart = raw.length;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] > 0x7e || (raw[i] < 0x20 && raw[i] !== 0x0a)) {
      badStart = i;
      break;
    }
  }
  const clean = raw.slice(0, badStart).toString();

  // 4. 提取 id 和 file
  const id      = (clean.match(/"id":"([^"]+)"/)   || [])[1] || null;
  const fileRaw = (clean.match(/"file":"(.+)/)      || [])[1] || '';

  // 5. 按 ' or ' 拆分多个URL，URL2路径被破坏，用URL1路径补全
  const parts    = fileRaw.split(' or ').map(u => u.trim());
  const url1path = parts[0].replace(/^https?:\/\/[^/]+/, '');
  const urls     = parts.map((u, i) => i === 0 ? u : u + url1path);

  return { id, urls };
}
async function play(inReq, _outResp) {
    let url = inReq.body.id || '';
    const data = await requestM3u8(url);
    return {
        parse:  0,
        url:    data.m3u8,
        header: { 'User-Agent': UA, Referer: site },
    };
}

async function requestM3u8(targetUrl) {
    try {
        const resp = await axios.post(SERVER_API, {
            url: targetUrl,
            referer: site + '/',
            key: 'mira123',
            sniff: true
        }, {
            timeout: 60000,
            // 明确指定是 JSON 格式，确保宝塔那边的 express.json() 能解析
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 如果服务器返回的是字符串（HTML），resp.data 就是源码
        return resp.data;
    } catch (e) {
        console.log('中转请求失败:', e.message);
        // 如果这里报错 403，就说明是 key 的问题
        // 如果报错 404，说明 SERVER_API 地址写错了
        throw e;
    }
}


async function search(inReq, _outResp) {
    const key = (inReq.body.wd || '').toLowerCase();
    if (!key) return { list: [] };

    const list = ALL_CHANNELS
        .filter((c) => c.title.toLowerCase().includes(key))
        .map(formatChannel);

    return { list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'oxax',
        name: '🔥OXAX直播',
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