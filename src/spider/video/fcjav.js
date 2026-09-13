import axios from 'axios';

const UA = 'Mozilla/5.0 (Linux; Android 14; 22127RK46C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const HOST = 'https://fcjav.com';

const CLASSES = [
  { type_id: 'movies', type_name: '最新' },
  { type_id: 'amateur', type_name: '业余' },
  { type_id: 'censored', type_name: '有码' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'reducing-mosaic', type_name: '减薄马赛克' },
  { type_id: 'uncensored-leaked', type_name: '无码流出' },
  { type_id: 'genre/amateur', type_name: '素人' },
  { type_id: 'genre/anal', type_name: '肛交' },
  { type_id: 'genre/av-idol', type_name: 'AV女优' },
  { type_id: 'genre/beautiful-girl', type_name: '美少女' },
  { type_id: 'genre/big-tits', type_name: '巨乳' },
  { type_id: 'genre/blowjob', type_name: '口交' },
  { type_id: 'genre/cosplay', type_name: 'Cosplay' },
  { type_id: 'genre/creampie', type_name: '中出' },
  { type_id: 'genre/cumshot', type_name: '颜射' },
  { type_id: 'genre/bondage', type_name: '束缚' },
];

async function fetchPage(url, extra = {}) {
  const resp = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: `${HOST}/`,
      ...extra,
    },
  });
  return resp.data;
}

function parseList(html) {
  const items = [];
  if (!html) return items;
  const blocks = String(html).split('<div class="ml-item">').slice(1);
  for (const b of blocks) {
    const mLink = b.match(/href="(https?:\/\/[^"]*\/v\/[^"]+)"/);
    if (!mLink) continue;
    const link = mLink[1];
    const vid = link.replace(/\/$/, '').split('/v/').pop();
    let mTitle = b.match(/<a[^>]+class="ml-mask[^"]*"[^>]*title="([^"]*)"/);
    if (!mTitle) mTitle = b.match(/title="([^"]*)"/);
    const name = mTitle ? mTitle[1].trim() : vid;
    let mPic = b.match(/data-original="([^"]+)"/);
    if (!mPic) mPic = b.match(/<img[^>]+src="([^"]+)"/);
    const pic = mPic ? mPic[1] : '';
    let mRem = b.match(/class="mli-runtimes"[^>]*>([^<]+)</);
    if (!mRem) mRem = b.match(/class="mli-code"[^>]*>([^<]+)</);
    const remark = mRem ? mRem[1].trim() : '';
    items.push({
      vod_id: vid,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: remark,
    });
  }
  return items;
}

function buildCatUrl(tid, page) {
  const p = parseInt(page, 10) || 1;
  const id = String(tid || 'movies');
  if (id.startsWith('genre/')) {
    const base = `${HOST}/${id}`;
    return p > 1 ? `${base}/pg-${p}` : base;
  }
  if (id === 'movies') {
    const base = `${HOST}/movies`;
    return p > 1 ? `${base}/pg-${p}` : base;
  }
  if (id === 'uncensored-leaked' || id === 'reducing-mosaic') {
    const base = `${HOST}/genre/${id}`;
    return p > 1 ? `${base}/pg-${p}` : base;
  }
  const base = `${HOST}/movies?genre=${id}`;
  return p > 1 ? `${base}&pg=${p}` : base;
}

function parsePageCount(html, page) {
  let pagecount = 1;
  const pages = [];
  const m = String(html || '').match(/<ul[^>]*class=['"]pagination['"][^>]*>[\s\S]*?<\/ul>/);
  const seg = m ? m[0] : String(html || '');
  for (const mm of seg.matchAll(/pg[-=](\d+)/g)) {
    pages.push(parseInt(mm[1], 10));
  }
  if (pages.length) {
    pagecount = Math.max(...pages);
    if (pagecount < page) pagecount = page;
  } else {
    const m2 = seg.match(/of\s+(\d+)/);
    if (m2) pagecount = Math.max(parseInt(m2[1], 10), page);
    else pagecount = page;
  }
  return pagecount;
}

function cleanTail(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function skeleton(vid, title = '', pic = '', remarks = '解析中') {
  const pid = String(vid).split('|$|')[0].replace(/\$/g, '|');
  return {
    list: [{
      vod_id: vid,
      vod_name: title || '未知标题',
      vod_pic: pic || '',
      vod_remarks: remarks,
      vod_content: '',
      vod_play_from: '播放',
      vod_play_url: `播放$${pid}`,
    }],
  };
}

function decodePlayerEnc(enc, pk) {
  try {
    const raw = Buffer.from(enc, 'base64');
    const key = Buffer.from(pk, 'utf8');
    const out = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) {
      out[i] = raw[i] ^ key[i % key.length];
    }
    return out.toString('utf8');
  } catch {
    return '';
  }
}

function extractPlayUrl(iframeHtml) {
  if (!iframeHtml) return '';
  const pats = [
    /var\s+urlPlay\s*=\s*'([^']+)'/,
    /var\s+urlPlay\s*=\s*"([^"]+)"/,
    /"file"\s*:\s*"([^"]+)"/,
    /'file'\s*:\s*'([^']+)'/,
  ];
  for (const pat of pats) {
    const m = iframeHtml.match(pat);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(inReq) {
  const tid = inReq.body.id;
  const page = parseInt(inReq.body.page, 10) || 1;
  const url = buildCatUrl(tid, page);
  const html = await fetchPage(url);
  const list = parseList(html);
  const pagecount = parsePageCount(html, page);
  return {
    list,
    page,
    pagecount,
    limit: 24,
    total: pagecount * 24,
  };
}

async function detail(inReq) {
  const raw = String(inReq.body.id || '').trim();
  if (!raw) return { list: [] };
  const vid = raw.split('|$|')[0];
  try {
    const durl = vid.startsWith('http') ? vid : `${HOST}/v/${vid}`;
    const html = await fetchPage(durl);
    if (!html || html.length < 500) return skeleton(raw, vid, '', '解析中');

    let name = '';
    let m = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    if (m) name = cleanTail(m[1].replace(/<[^>]+>/g, ''));
    if (!name) {
      m = html.match(/<title>(.*?)<\/title>/s);
      if (m) {
        name = cleanTail(m[1]);
        name = name.replace(/\s*[-|]\s*FCJAV.*$/i, '');
      }
    }
    if (!name) name = vid;

    let pic = '';
    for (const pat of [
      /og:image"\s+content="([^"]+)"/,
      /data-poster="([^"]+)"/,
      /<img[^>]+class="cover"[^>]+src="([^"]+)"/,
    ]) {
      m = html.match(pat);
      if (m) {
        pic = m[1];
        break;
      }
    }

    let content = '';
    m = html.match(/name="description"\s+content="([^"]*)"/);
    if (m) content = m[1];
    if (!content) {
      m = html.match(/property="og:description"\s+content="([^"]*)"/);
      if (m) content = m[1];
    }

    let remark = '';
    m = html.match(/class="mli-runtimes"[^>]*>([^<]+)</);
    if (m) remark = m[1].trim();

    let eps = [...html.matchAll(/class="switch-source[^"]*"\s+data-source="(\d+)"\s+data-id="(\d+)"[^>]*>[\s\S]*?<\/button>/g)]
      .map((x) => [x[1], x[2]]);
    if (!eps.length) {
      eps = [...html.matchAll(/data-source="(\d+)"\s+data-id="(\d+)"/g)].map((x) => [x[1], x[2]]);
    }
    const names = [...html.matchAll(/class="switch-source[^"]*"[^>]*>[\s\S]*?<\/i>\s*([A-Za-z0-9]+)\s*<\/button>/g)]
      .map((x) => x[1]);

    if (!eps.length) return skeleton(raw, name, pic, remark || '解析中');

    const epList = [];
    const seen = new Set();
    eps.forEach(([src, eid], idx) => {
      if (seen.has(eid)) return;
      seen.add(eid);
      const epName = names[idx] || `线路${idx + 1}`;
      epList.push(`${epName}$${src}|${eid}|${vid}`);
    });
    if (!epList.length) return skeleton(raw, name, pic, remark || '解析中');

    return {
      list: [{
        vod_id: raw,
        vod_name: name,
        vod_pic: pic,
        vod_remarks: remark,
        vod_content: content,
        vod_play_from: '播放',
        vod_play_url: epList.join('#'),
      }],
    };
  } catch {
    return skeleton(raw);
  }
}

async function play(inReq) {
  let raw = String(inReq.body.id || '');
  if (raw.includes('$')) raw = raw.split('$').slice(1).join('$');

  let filmId = '';
  let eid = '';
  let slug = '';

  if (raw.includes('|') && !raw.startsWith('http')) {
    const parts = raw.split('|');
    filmId = parts[0] || '';
    eid = parts[1] || '';
    slug = parts[2] || '';
  } else if (raw.startsWith('http')) {
    if (raw.endsWith('.mp4') || raw.endsWith('.m3u8')) {
      return { parse: 0, url: raw, header: { 'User-Agent': UA } };
    }
    slug = raw.replace(/\/$/, '').split('/v/').pop();
  } else {
    slug = raw;
  }

  let pt = '';
  let pk = '';
  let det = '';
  if (slug) det = await fetchPage(`${HOST}/v/${slug}`);
  if (det) {
    if (!filmId) {
      let m = det.match(/filmId\s*=\s*(\d+)/);
      if (m) filmId = m[1];
      m = det.match(/data-source="(\d+)"\s+data-id="(\d+)"/);
      if (m) {
        filmId = m[1];
        if (!eid) eid = m[2];
      }
    }
    const ptM = det.match(/__pt\s*=\s*"([^"]+)"/);
    const pkM = det.match(/__pk\s*=\s*"([^"]+)"/);
    pt = ptM ? ptM[1] : '';
    pk = pkM ? pkM[1] : '';
  }

  const fallback = {
    parse: 1,
    url: slug ? `${HOST}/v/${slug}` : `${HOST}/movies`,
    header: { 'User-Agent': UA, Referer: `${HOST}/` },
  };

  if (!filmId || !pt || !pk) return fallback;

  const referer = slug ? `${HOST}/v/${slug}` : `${HOST}/`;
  let resp;
  try {
    resp = await axios.post(`${HOST}/ajax/player`, `episode=${eid}&filmId=${filmId}&pt=${pt}`, {
      headers: {
        'User-Agent': UA,
        Referer: referer,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });
  } catch {
    return fallback;
  }

  let j = resp.data;
  if (typeof j === 'string') {
    try {
      j = JSON.parse(j);
    } catch {
      return fallback;
    }
  }
  if (!j || j.error) return fallback;

  let iframeHtml = '';
  if (j.player_enc) iframeHtml = decodePlayerEnc(j.player_enc, pk);
  else if (j.player) iframeHtml = j.player;

  let iframeUrl = '';
  const srcM = String(iframeHtml || '').match(/src="([^"]+)"/);
  if (srcM) iframeUrl = srcM[1];

  let playUrl = '';
  if (iframeUrl) {
    const ih = await fetchPage(iframeUrl, { Referer: `${HOST}/` });
    playUrl = extractPlayUrl(ih);
  }

  if (playUrl) {
    return {
      parse: 0,
      url: playUrl,
      header: { 'User-Agent': UA, Referer: `${HOST}/` },
    };
  }
  if (iframeUrl) {
    return { parse: 1, url: iframeUrl, header: { 'User-Agent': UA, Referer: `${HOST}/` } };
  }
  return fallback;
}

async function search(inReq) {
  const key = encodeURIComponent(String(inReq.body.wd || '').trim());
  const page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
  const url = page > 1 ? `${HOST}/search/${key}/pg-${page}` : `${HOST}/search/${key}`;
  const html = await fetchPage(url);
  return { list: parseList(html), page };
}

export default {
  meta: {
    key: 'fcjav',
    name: '🔥FCJAV',
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
