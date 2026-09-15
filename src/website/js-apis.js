import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getSpiders } from '../router.js';
import { getCache, setCache, removeCache } from './sites.js';

function jsDir() {
  const dir = path.join(process.env.NODE_PATH || '.', 'js');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { }
  return dir;
}

function keyOf(name) {
  return String(name || '').replace(/\.js$/i, '');
}

function sizeStr(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function siteKey(spider) {
  return 'nodejs_' + String(spider?.meta?.key || '').trim();
}

async function listJsFiles(db) {
  const dir = jsDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => /\.js$/i.test(f) && !/^emby_/i.test(f));
  } catch (e) {
    names = [];
  }
  let order = [];
  try { order = await db.getObjectDefault('/js/order', []); } catch (e) { order = []; }
  if (Array.isArray(order) && order.length) {
    names.sort((a, b) => {
      let ia = order.indexOf(a), ib = order.indexOf(b);
      ia = ia < 0 ? 100000 : ia;
      ib = ib < 0 ? 100000 : ib;
      return ia - ib || a.localeCompare(b);
    });
  }
  return names.map((name) => {
    const full = path.join(dir, name);
    let size = 0, mtime = 0;
    try {
      const st = fs.statSync(full);
      size = st.size;
      mtime = st.mtimeMs;
    } catch (e) { }
    return {
      name,
      key: keyOf(name),
      path: full,
      size,
      size_str: sizeStr(size),
      mtime,
      loaded: false,
      error: '',
      title: '',
    };
  });
}

async function siteList(server) {
  const spiders = await getSpiders(server);
  const old = await getCache(server);
  const oldMap = {};
  (old || []).forEach((x) => { if (x && x.key) oldMap[String(x.key)] = x; });
  const rank = {};
  (old || []).forEach((item, i) => {
    const key = String(item?.key || item || '').trim();
    if (key && rank[key] === undefined) rank[key] = i;
  });
  const list = spiders.map((spider) => {
    const meta = spider?.meta || {};
    const key = siteKey(spider);
    const saved = oldMap[key] || oldMap[String(meta.key || '')] || {};
    return {
      key,
      name: saved.name || meta.name || meta.key || key,
      type: Number(meta.type) || 3,
      api: '/spider/' + String(meta.key || '') + '/' + (Number(meta.type) || 3),
      enable: saved.enable !== false,
      t4: saved.t4,
      cms: saved.cms,
    };
  });
  return list.sort((a, b) => {
    const ar = rank[a.key] === undefined ? 100000 : rank[a.key];
    const br = rank[b.key] === undefined ? 100000 : rank[b.key];
    return ar - br || a.key.localeCompare(b.key);
  });
}

async function probeUrl(url, timeout = 20000) {
  const t0 = Date.now();
  const res = {
    url, ok: false, kind: '', status: 0, contentType: '', contentLength: '',
    bytes: 0, magic: '', ms: 0,
  };
  try {
    const r = await axios.get(url, {
      timeout,
      responseType: 'arraybuffer',
      maxContentLength: 512 * 1024,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Range: 'bytes=0-65535',
      },
    });
    const buf = Buffer.from(r.data || []);
    const ct = String(r.headers['content-type'] || '');
    const head = buf.slice(0, 64).toString('latin1');
    res.status = r.status;
    res.contentType = ct;
    res.contentLength = r.headers['content-length'] || '';
    res.bytes = buf.length;
    res.ms = Date.now() - t0;
    if (/^#EXTM3U/.test(head)) res.kind = 'hls';
    else if (/ftyp/.test(head.slice(4, 12))) res.kind = 'mp4';
    else if (buf[0] === 0x47) res.kind = 'ts';
    else if (/^video\//i.test(ct)) res.kind = 'video';
    else if (/^audio\//i.test(ct)) res.kind = 'audio';
    else if (/^image\//i.test(ct)) res.kind = 'image';
    else res.kind = 'bin';
    res.ok = r.status >= 200 && r.status < 400 && buf.length > 0;
  } catch (e) {
    res.ms = Date.now() - t0;
    res.magic = e.message;
  }
  return res;
}

export default async function jsApis(fastify) {
  const dbOf = (req) => req.server.db;

  fastify.get('/list', async (req, res) => {
    const files = await listJsFiles(dbOf(req));
    res.send({ code: 0, data: { dir: jsDir(), version: 'src', files } });
  });

  fastify.put('/order', async (req, res) => {
    const order = Array.isArray(req.body) ? req.body : (req.body?.order || []);
    await dbOf(req).push('/js/order', order);
    res.send({ code: 0, message: '排序已保存' });
  });

  fastify.post('/reload', async (_req, res) => {
    res.send({ code: 0, message: '已记录。内置源请重启服务后生效；本地 JS 目录下次启动会重新扫描。' });
  });

  fastify.get('/source/:name', async (req, res) => {
    const name = decodeURIComponent(req.params.name || '');
    if (!/\.js$/i.test(name) || name.includes('/') || name.includes('\\')) {
      return res.code(400).send({ code: -1, message: '文件名不合法' });
    }
    const full = path.join(jsDir(), name);
    if (!fs.existsSync(full)) return res.code(404).send({ code: -1, message: '文件不存在' });
    const st = fs.statSync(full);
    res.send({ code: 0, data: { name, size: st.size, content: fs.readFileSync(full, 'utf8') } });
  });

  fastify.post('/upload', { bodyLimit: 32 * 1024 * 1024 }, async (req, res) => {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const name = String(body.name || body.filename || '').trim();
    let content = body.content;
    if (typeof content !== 'string' && typeof body.contentBase64 === 'string') {
      content = Buffer.from(body.contentBase64, 'base64').toString('utf8');
    }
    if (!name || !/\.js$/i.test(name) || name.includes('/') || name.includes('\\')) {
      return res.code(400).send({ code: -1, message: '文件名不合法' });
    }
    if (typeof content !== 'string') return res.code(400).send({ code: -1, message: '缺少脚本内容' });
    const full = path.join(jsDir(), name);
    const overwrite = body.overwrite === true || body.overwrite === '1' || body.overwrite === 'true';
    if (fs.existsSync(full) && !overwrite) {
      return res.code(409).send({ code: -1, message: '文件已存在，请确认覆盖', data: { exists: true, name } });
    }
    fs.writeFileSync(full, content, 'utf8');
    res.send({ code: 0, message: '保存成功', data: { name, key: keyOf(name) } });
  });

  fastify.post('/import', { bodyLimit: 32 * 1024 * 1024 }, async (req, res) => {
    try {
      let body = Object.assign({}, req.body || {}, { overwrite: true });
      if (body.url && !body.name) {
        try {
          body.name = decodeURIComponent(String(body.url).split('/').pop().split('?')[0] || 'import.js');
        } catch (e) {
          body.name = 'import.js';
        }
        if (!/\.js$/i.test(body.name)) body.name += '.js';
      }
      if (body.url && typeof body.content !== 'string' && typeof body.contentBase64 !== 'string') {
        const r = await axios.get(String(body.url), { timeout: 30000, responseType: 'text' });
        body.content = typeof r.data === 'string' ? r.data : String(r.data);
      }
      const name = String(body.name || body.filename || '').trim();
      let content = body.content;
      if (typeof content !== 'string' && typeof body.contentBase64 === 'string') {
        content = Buffer.from(body.contentBase64, 'base64').toString('utf8');
      }
      if (!name || !/\.js$/i.test(name) || name.includes('/') || name.includes('\\')) {
        return res.code(400).send({ code: -1, message: '文件名不合法' });
      }
      if (typeof content !== 'string') return res.code(400).send({ code: -1, message: '缺少脚本内容' });
      fs.writeFileSync(path.join(jsDir(), name), content, 'utf8');
      res.send({ code: 0, message: '导入成功', data: { name, key: keyOf(name) } });
    } catch (e) {
      res.code(500).send({ code: -1, message: e.message });
    }
  });

  fastify.delete('/file/:name', async (req, res) => {
    const name = decodeURIComponent(req.params.name || '');
    if (!name || !/\.js$/i.test(name) || name.includes('/') || name.includes('\\')) {
      return res.code(400).send({ code: -1, message: '文件名不合法' });
    }
    const full = path.join(jsDir(), name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    try {
      const order = await dbOf(req).getObjectDefault('/js/order', []);
      if (Array.isArray(order) && order.includes(name)) {
        await dbOf(req).push('/js/order', order.filter((n) => n !== name));
      }
    } catch (e) { }
    res.send({ code: 0, message: '删除成功', data: { name } });
  });

  fastify.get('/config/:key', async (req, res) => {
    const key = decodeURIComponent(req.params.key || '');
    let cfg = {};
    try { cfg = await dbOf(req).getObjectDefault('/js_config/' + key, {}); } catch (e) { cfg = {}; }
    res.send({ code: 0, data: cfg || {} });
  });

  fastify.post('/config/:key', async (req, res) => {
    const key = decodeURIComponent(req.params.key || '');
    await dbOf(req).push('/js_config/' + key, req.body || {});
    res.send({ code: 0, message: '配置已保存', data: req.body || {} });
  });

  fastify.get('/sites', async (req, res) => {
    res.send({ code: 0, data: { list: await siteList(req.server) } });
  });

  fastify.put('/sites', async (req, res) => {
    await setCache(req.server, req.body?.list || []);
    res.send({ code: 0, message: '排序与名称已保存' });
  });

  fastify.delete('/sites', async (req, res) => {
    await removeCache(req.server);
    res.send({ code: 0, message: '已重置' });
  });

  fastify.post('/probe', async (req, res) => {
    const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const timeout = Number(req.body?.timeout) || 20000;
    const out = [];
    for (const u of urls.slice(0, 8)) {
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) out.push(await probeUrl(u, timeout));
    }
    res.send({ code: 0, data: out });
  });

  fastify.get('/engines', async (_req, res) => res.send({ code: 0, data: [] }));
  fastify.get('/interfaces', async (_req, res) => res.send({ code: 0, data: [] }));
  fastify.get('/backup/info', async (_req, res) => res.send({ code: 0, data: { count: 0, bytes: 0, bytes_str: '0 B' } }));
  fastify.get('/reports', async (_req, res) => res.send({ code: 0, data: { files: [] } }));
  fastify.get('/logs/:key', async (_req, res) => res.send({ code: 0, data: { lines: [] } }));
}
