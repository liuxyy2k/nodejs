import axios from 'axios';

const CACHE_TTL = 5 * 60 * 1000;
const PAGE_SIZE = 50;
const playlistCache = new Map();

async function parsePlaylist(url, sourceName) {
  const cached = playlistCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.channels;
  }

  try {
    const text = (await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })).data;

    const lines = String(text).split('\n');
    const channels = [];
    let autoIndex = 0;
    let skipped = 0;

    for (const raw of lines) {
      const original = raw;
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('http')) {
        autoIndex++;
        channels.push({ name: `频道${autoIndex}`, url: line });
        continue;
      }

      const m = line.match(/^(.+?),(https?:\/\/.+)$/);
      if (m) {
        channels.push({ name: m[1].trim(), url: m[2].trim() });
        continue;
      }

      if (line && !line.startsWith('#')) {
        skipped++;
        if (skipped <= 3) console.log(`[${sourceName}] 无法解析的行: ${original}`);
      }
    }

    if (skipped > 0) console.log(`[${sourceName}] 跳过 ${skipped} 行无法解析的内容`);
    playlistCache.set(url, { channels, timestamp: Date.now() });
    console.log(`[${sourceName}] 解析成功，共 ${channels.length} 个频道`);
    return channels;
  } catch (e) {
    console.error(`[${sourceName}] 解析直播源失败:`, e.message);
    return [];
  }
}

async function getEnabledSources(db) {
  try {
    return (await db.getData('/liveSources') || []).filter((s) => s.enabled !== false);
  } catch {
    return [];
  }
}

async function init() {
  return {};
}

async function home(inReq) {
  const sources = await getEnabledSources(inReq.server.db);
  return {
    class: sources.map((s) => ({
      type_id: String(s.id),
      type_name: s.name,
    })),
  };
}

async function category(inReq) {
  const sources = await getEnabledSources(inReq.server.db);
  const sourceId = inReq.body.id;
  const page = inReq.body.page || 1;
  const source = sources.find((s) => String(s.id) === String(sourceId));

  if (!source) {
    return { page, pagecount: 1, list: [], filter: {} };
  }

  const channels = await parsePlaylist(source.url, source.name);
  const offset = (page - 1) * PAGE_SIZE;
  const list = channels.slice(offset, offset + PAGE_SIZE).map((ch, i) => ({
    vod_id: `${source.id}_${offset + i}`,
    vod_name: ch.name,
    vod_pic: '',
    vod_remarks: '直播',
  }));

  return {
    page,
    pagecount: Math.ceil(channels.length / PAGE_SIZE) || 1,
    list,
    filter: {},
  };
}

async function detail(inReq) {
  const parts = String(inReq.body.id).split('_');
  if (parts.length !== 2) return { list: [] };

  const [sourceId, indexStr] = parts;
  const sources = await getEnabledSources(inReq.server.db);
  const source = sources.find((s) => String(s.id) === String(sourceId));
  if (!source) return { list: [] };

  const channels = await parsePlaylist(source.url, source.name);
  const index = parseInt(indexStr, 10);
  if (index < 0 || index >= channels.length) return { list: [] };

  const ch = channels[index];
  return {
    list: [{
      vod_name: ch.name,
      vod_play_from: source.name,
      vod_play_url: `播放$${ch.url}`,
    }],
  };
}

async function play(inReq) {
  return { url: inReq.body.id };
}

async function search(inReq) {
  const wd = (inReq.body.wd || '').toLowerCase();
  const page = inReq.body.page || 1;
  const sources = await getEnabledSources(inReq.server.db);
  const matched = [];

  for (const source of sources) {
    const channels = await parsePlaylist(source.url, source.name);
    channels
      .filter((ch) => ch.name.toLowerCase().includes(wd))
      .forEach((ch, index) => {
        matched.push({
          sourceId: source.id,
          sourceName: source.name,
          channel: ch,
          channelIndex: index,
        });
      });
  }

  const offset = (page - 1) * PAGE_SIZE;
  const list = matched.slice(offset, offset + PAGE_SIZE).map((item) => ({
    vod_id: `${item.sourceId}_${item.channelIndex}`,
    vod_name: item.channel.name,
    vod_pic: '',
    vod_remarks: item.sourceName,
  }));

  return {
    page,
    pagecount: Math.ceil(matched.length / PAGE_SIZE) || 1,
    list,
  };
}

export default {
  meta: {
    key: 'liveSource',
    name: '📺直播源',
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
