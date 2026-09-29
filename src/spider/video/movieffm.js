import axios from 'axios';
import { load } from 'cheerio';
import vm from 'node:vm';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://www.movieffm.net';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA,'Referer': site + '/' },
        // httpsAgent: agent
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/category/popular-jav/',   type_name: '热门推荐' },
        { type_id: '/category/chinese-subtitles/',   type_name: '中文字幕' },
        { type_id: '/tag/無碼破解/',   type_name: '无码破解' },
        { type_id: '/category/hd-censored/',  type_name: '有码' },
        { type_id: '/category/amateur/',type_name: '素人' },
        { type_id: '/category/hd-uncensored/',    type_name: '无码' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id = inReq.body.id;
    const page = inReq.body.page || 1;
    let url = `${site}${id}page/${page}/`;
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.post').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('h2').text().trim();
        const cover = $(element).find('.image').attr('data-bg');
        const duration = $(element).find('.date').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: `${duration}`,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}


/**
 * 自动解 Dean Edwards Packer 混淆
 * 支持直接输入整段 HTML / JS
 */

function unpackPacker(source) {
  const regex =
    /eval\(function\(p,a,c,k,e,(?:r|d)\)\{[\s\S]*?\}\(([\s\S]*?)\)\)/;

  const match = source.match(regex);
  if (!match) {
    throw new Error("未找到 packer 混淆代码");
  }

  // 把参数拆出来
  const args = splitArgs(match[1]);

  let [p, a, c, k] = args;

  // 去掉字符串引号
  p = stripQuotes(p);
  a = Number(a);
  c = Number(c);
  k = stripQuotes(k).split('|');

  return unpackCore(p, a, c, k);
}

/**
 * 核心替换逻辑（100%还原 packer 行为）
 */
function unpackCore(p, a, c, k) {
  const d = {};

  while (c--) {
    d[c] = k[c] || String(c);
  }

  return p.replace(/\b(\w+)\b/g, (word) => {
    return d[word] ?? word;
  });
}

/**
 * 拆参数（解决逗号在字符串里的问题）
 */
function splitArgs(str) {
  const result = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let quote = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      current += ch;
      if (ch === quote && str[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === '(') depth++;
    if (ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current) result.push(current.trim());

  return result;
}

/**
 * 去掉字符串引号
 */
function stripQuotes(str) {
  return str.replace(/^['"]|['"]$/g, '');
}

function parseMDCore(code) {
  const obj = {};

  // 字符串字段
  code.replace(/MDCore\.(\w+)\s*=\s*"([^"]*)"/g, (_, key, val) => {
    obj[key] = val;
  });

  // 数字字段
  code.replace(/MDCore\.(\w+)\s*=\s*(\d+)/g, (_, key, val) => {
    obj[key] = Number(val);
  });

  return obj;
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);

    const $ = load(html);
    const name = $('meta[property="og:title"]').attr('content') || '';
    const des = $('meta[property="og:description"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const videosBlock = html.match(/videos\s*:\s*\[([\s\S]*?)\]/);
    let videoUrl = '';
    if (videosBlock) {
        const urls = [...videosBlock[1].matchAll(/"url"\s*:\s*"([^"]+)"/g)]
        .map(m => m[1].replace(/\\\//g, '/'));
        const result = urls[0].split('/e/')[1];
        console.log(result);
        videoUrl = 'https://m1xdrop.click/e/' + result
    }
    let playUrl = ''
    const videoData = await request(videoUrl);
    // 1️⃣ 解混淆
    const unpacked = unpackPacker(videoData);

    console.log("解混淆结果：\n", unpacked);

    // 2️⃣ 提取结构
    const data = parseMDCore(unpacked);

    console.log("\n结构化数据：\n", data);

    // 3️⃣ 拼视频直链
    if (data.wurl) {
        playUrl = `https:${data.wurl}`;
    }
    
    return {
        list: [{
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'movieffm',
            vod_play_url: `播放$${playUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
  const url = inReq.body.id
  const proxyUrl = `http://127.0.0.1:${PORT}/spider/movieffm/3/proxy?url=${encodeURIComponent(url)}`;
    return {
        parse: 0,
        url: proxyUrl,
        header: {},
    };
}

async function videoProxy(req, reply) {
    const targetUrl = req.query.url;
    console.log("代理请求目标 URL：", targetUrl);
    if (!targetUrl) {
        return reply.code(400).send('Missing url param');
    }

    try {
        const upstream = await axios.get(targetUrl, {
            responseType: 'stream',
            // httpsAgent: agent,  
            headers: {
                'User-Agent': UA,
                'Referer':  'https://m1xdrop.click/',
                'Origin':   'https://m1xdrop.click',
            },
        });

        // 透传关键响应头
        const passHeaders = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
        ];
        passHeaders.forEach(h => {
            if (upstream.headers[h]) reply.header(h, upstream.headers[h]);
        });

        // 支持 Range 请求（断点续传 / 拖进度条）
        if (req.headers.range) {
            const rangeResp = await axios.get(targetUrl, {
                responseType: 'stream',
                // httpsAgent: agent,
                headers: {
                    'User-Agent': UA,
                    'Referer':  'https://m1xdrop.click/',
                    'Origin':   'https://m1xdrop.click',
                    'Range': req.headers.range,    // 转发客户端 Range
                },
            });

            passHeaders.forEach(h => {
                if (rangeResp.headers[h]) reply.header(h, rangeResp.headers[h]);
            });
            reply.header('Access-Control-Allow-Origin', '*');
            reply.code(rangeResp.status); // 通常是 206
            return reply.send(rangeResp.data);
        }

        reply.header('Access-Control-Allow-Origin', '*');
        reply.code(upstream.status);
        return reply.send(upstream.data);   // pipe 流到客户端

    } catch (err) {
        req.log.error(err);
        return reply.code(502).send('Proxy error: ' + err.message);
    }
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}?search=${text}&searchtype=video&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.col-xs-12.col-sm-4.col-md-3.col-lg-3').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.video-title').text().trim();
        const cover = $(element).find('.image').attr('data-bg');
        const duration = $(element).find('.duration').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: `${duration}`,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'movieffm',
        name: '🌸Movieffm',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', videoProxy);
    },
};