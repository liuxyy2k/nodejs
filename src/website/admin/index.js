import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { JsonDB, Config } from 'node-json-db';
import defaults from './defaults.json' with { type: 'json' };
import { loadPage, wantsHtml } from './pages.js';
import {
  getSite, setSite, getMissavCookie, setMissavCookie,
  getJableActors, setJableActors, resetJableActors,
  getMissavActors, setMissavActors, resetMissavActors,
  setLiveSources,
  getCmsSources, setCmsSources, addCmsSource, updateCmsSource, deleteCmsSource,
  getM3u8Settings, setM3u8Settings, resetM3u8Settings,
  clearDbCookies, findDbCookiePaths, getDbFileName,
} from './store.js';
import cookieStore from '../../util/cookieStore.js';
import monitorRoutes from '../../util/monitor.js';
import { getStats as getM3u8Stats } from '../../util/m3u8Accel.js';
import {
  mergeLiveSources, reloadLiveCache, testLiveParse, probeLiveSource,
} from '../../spider/video/liveSource.js';

function ok(data, message) {
  return message ? { code: 0, message, data } : { code: 0, data };
}

function fail(res, status, message) {
  return res.status(status).send({ code: -1, message });
}

function scanDir(dirPath) {
  const entries = fs.readdirSync(dirPath);
  const files = [];
  for (const name of entries) {
    const full = path.join(dirPath, name);
    const stat = fs.statSync(full);
    const relativePath = name;
    if (stat.isDirectory()) {
      files.push({
        name,
        path: full,
        relativePath,
        type: 'folder',
        size: 0,
        modified: stat.mtimeMs,
        children: scanDir(full),
        expanded: false,
      });
    } else if (stat.isFile()) {
      files.push({
        name,
        path: full,
        relativePath,
        type: 'file',
        size: stat.size,
        modified: stat.mtimeMs,
      });
    }
  }
  return files;
}

async function listCookiePayload(db) {
  const runtime = await cookieStore.listGrouped();
  runtime.dbCookies = findDbCookiePaths(await db.getData('/').catch(() => ({})));
  return runtime;
}

export default async function admin(fastify) {
  await fastify.register(monitorRoutes);
  const db = (req) => req.server.db;

  fastify.get('/', async (req, res) => {
    const accept = String(req.headers.accept || '');
    const wantJson = accept.includes('application/json') && !accept.includes('text/html');
    if (!wantJson) return res.type('text/html').send(loadPage('index'));
    const d = db(req);
    return res.send(ok({
      sites: { missav: await getSite(d, 'missav') },
      jableActors: await getJableActors(d),
      missavActors: await getMissavActors(d),
    }));
  });

  fastify.get('/js', async (req, res) => {
    if (wantsHtml(req) || !req.headers['x-requested-with']) {
      return res.type('text/html; charset=utf-8').send(loadPage('js'));
    }
    return res.send(ok({ files: [] }));
  });

  fastify.get('/sites', async (_req, res) => {
    return res.type('text/html; charset=utf-8').send(loadPage('sites'));
  });

  fastify.get('/missav', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('missav'));
    const d = db(req);
    return res.send(ok({
      sites: { missav: await getSite(d, 'missav') },
      cookie: await getMissavCookie(d),
      actors: await getMissavActors(d),
    }));
  });

  fastify.post('/missav/site', async (req, res) => {
    try {
      if (req.body?.missav !== undefined) await setSite(db(req), 'missav', req.body.missav);
      res.send(ok(null, '域名配置保存成功'));
    } catch (e) {
      fail(res, 500, '保存失败: ' + e.message);
    }
  });

  fastify.post('/missav/cookie', async (req, res) => {
    try {
      await setMissavCookie(db(req), req.body?.cookie);
      res.send(ok(null, 'Cookie 配置保存成功'));
    } catch (e) {
      fail(res, 500, '保存失败: ' + e.message);
    }
  });

  fastify.post('/missav/actors', async (req, res) => {
    const actors = req.body?.actors;
    if (!Array.isArray(actors)) return fail(res, 400, '无效的演员列表数据');
    try {
      await setMissavActors(db(req), actors);
      res.send(ok(null, 'MissAV 演员列表保存成功'));
    } catch (e) {
      fail(res, 500, '保存失败: ' + e.message);
    }
  });

  fastify.post('/missav/actors/reset', async (req, res) => {
    try {
      const data = await resetMissavActors(db(req));
      res.send(ok(data, '已重置为默认演员列表'));
    } catch (e) {
      fail(res, 500, '重置失败: ' + e.message);
    }
  });

  fastify.get('/jable', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('jable'));
    return res.send(ok({ actors: await getJableActors(db(req)) }));
  });

  fastify.post('/jable/actors', async (req, res) => {
    const actors = req.body?.actors;
    if (!Array.isArray(actors)) return fail(res, 400, '无效的演员列表数据');
    try {
      await setJableActors(db(req), actors);
      res.send(ok(null, 'Jable 演员列表保存成功'));
    } catch (e) {
      fail(res, 500, '保存失败: ' + e.message);
    }
  });

  fastify.post('/jable/actors/reset', async (req, res) => {
    try {
      const data = await resetJableActors(db(req));
      res.send(ok(data, '已重置为默认演员列表'));
    } catch (e) {
      fail(res, 500, '重置失败: ' + e.message);
    }
  });

  fastify.get('/search', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('search'));
    return res.code(404).send({ error: 'Not Found' });
  });

  fastify.get('/search-data', async (_req, res) => {
    res.send(ok({
      modelIndex: defaults.searchModelIndex || [],
      modelsList: defaults.searchModels || [],
    }));
  });

  fastify.post('/add-actor/missav', async (req, res) => {
    const name = req.body?.name;
    try {
      const list = await getMissavActors(db(req));
      if (list.some((a) => a.name === name)) return res.send({ code: -1, message: '该演员已存在' });
      list.unshift({ name, enabled: true });
      await setMissavActors(db(req), list);
      res.send(ok(null, '添加成功'));
    } catch (e) {
      fail(res, 500, '添加失败: ' + e.message);
    }
  });

  fastify.post('/add-actor/jable', async (req, res) => {
    const { name, link } = req.body || {};
    try {
      const list = await getJableActors(db(req));
      if (list.some((a) => a.name === name || a.link === link)) {
        return res.send({ code: -1, message: '该演员已存在' });
      }
      list.unshift({ name, link, enabled: true });
      await setJableActors(db(req), list);
      res.send(ok(null, '添加成功'));
    } catch (e) {
      fail(res, 500, '添加失败: ' + e.message);
    }
  });

  fastify.get('/cms', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('cms'));
    return res.send(ok({ sources: await getCmsSources(db(req)) }));
  });

  fastify.post('/cms', async (req, res) => {
    const sources = req.body?.sources;
    if (!Array.isArray(sources)) return fail(res, 400, '无效的 CMS 源数据');
    for (const s of sources) {
      if (!s.key || !s.name || !s.api) return fail(res, 400, '每个 CMS 源必须包含 key、name 和 api');
    }
    const keys = sources.map((s) => s.key);
    if (keys.length !== new Set(keys).size) return fail(res, 400, 'CMS 源的 key 必须唯一');
    try {
      await setCmsSources(db(req), sources);
      res.send(ok(null, 'CMS 源配置保存成功,请重启服务器以生效'));
    } catch (e) {
      fail(res, 500, '保存失败: ' + e.message);
    }
  });

  fastify.post('/cms/test', async (req, res) => {
    const api = req.body?.api;
    if (!api) return fail(res, 400, 'API 地址不能为空');
    try {
      const resp = await axios.get(`${api}?ac=list&tid=1&pg=1`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (resp.data?.list) {
        res.send(ok({ count: resp.data.list.length || 0 }, '连接成功'));
      } else {
        res.send({ code: -1, message: '无效的 CMS API 响应格式' });
      }
    } catch (e) {
      fail(res, 500, '连接失败: ' + e.message);
    }
  });

  fastify.post('/cms/add', async (req, res) => {
    try {
      const source = await addCmsSource(db(req), {
        key: req.body.key,
        name: req.body.name,
        api: req.body.api,
        apiKey: req.body.apiKey || '',
        group: req.body.group || '',
        ext: req.body.ext || '',
        enabled: true,
      });
      res.send(ok(source, 'CMS 源添加成功'));
    } catch (e) {
      fail(res, 400, e.message);
    }
  });

  fastify.post('/cms/update', async (req, res) => {
    try {
      const data = await updateCmsSource(db(req), req.body.id, {
        key: req.body.key,
        name: req.body.name,
        api: req.body.api,
        apiKey: req.body.apiKey,
        group: req.body.group,
        ext: req.body.ext,
        enabled: req.body.enabled,
      });
      res.send(ok(data, 'CMS 源更新成功'));
    } catch (e) {
      fail(res, 400, e.message);
    }
  });

  fastify.post('/cms/delete', async (req, res) => {
    if (!req.body?.id) return fail(res, 400, 'CMS 源 ID 不能为空');
    try {
      await deleteCmsSource(db(req), req.body.id);
      res.send(ok(null, 'CMS 源删除成功,请重启服务器以生效'));
    } catch (e) {
      fail(res, 500, '删除失败: ' + e.message);
    }
  });

  fastify.get('/live', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('live'));
    return res.send(ok({ sources: await mergeLiveSources(db(req)) }));
  });

  fastify.post('/live', async (req, res) => {
    const sources = req.body?.sources;
    if (!Array.isArray(sources)) return fail(res, 400, '无效的直播源数据');
    for (const s of sources) {
      if (!s.name || !s.url) return fail(res, 400, '每个直播源必须包含名称和链接');
      if (!s.url.startsWith('http://') && !s.url.startsWith('https://')) {
        return fail(res, 400, '链接必须以 http:// 或 https:// 开头');
      }
    }
    try {
      await setLiveSources(db(req), sources);
      reloadLiveCache();
      res.send(ok(null, '直播源配置保存成功，已立即生效'));
    } catch (e) {
      fail(res, 500, '保存失败: ' + e.message);
    }
  });

  fastify.post('/live/test', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!url) return fail(res, 400, '请填写列表链接');
    try {
      const data = await testLiveParse({
        url,
        ua: req.body?.ua || '',
        cookie: req.body?.cookie || '',
      });
      res.send(ok(data));
    } catch (e) {
      fail(res, 500, e.message || '解析失败');
    }
  });

  fastify.post('/live/probe', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!url) return fail(res, 400, '请填写列表链接');
    try {
      const data = await probeLiveSource({
        url,
        ua: req.body?.ua || '',
        cookie: req.body?.cookie || '',
      }, { sample: req.body?.sample, group: req.body?.group, deep: req.body?.deep });
      res.send(ok(data));
    } catch (e) {
      fail(res, 500, e.message || '探测失败');
    }
  });

  fastify.get('/database', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('database'));
    return res.code(404).send({ error: 'Not Found' });
  });

  fastify.get('/database/info', async (_req, res) => {
    try {
      const nodePath = process.env.NODE_PATH || null;
      const base = nodePath || '.';
      const dbFile = path.join(base, getDbFileName());
      res.send(ok({
        nodePath,
        documentsPath: path.join(os.homedir(), 'Documents'),
        currentPath: fs.realpathSync('.'),
        currentDbFile: dbFile,
      }));
    } catch (e) {
      fail(res, 500, '获取信息失败: ' + e.message);
    }
  });

  fastify.get('/database/scan', async (req, res) => {
    const type = req.query?.type;
    let scanDirPath;
    let scanLabel;
    switch (type) {
      case 'nodepath':
        scanDirPath = process.env.NODE_PATH;
        scanLabel = scanDirPath || '未设置';
        if (!scanDirPath) {
          return res.send(ok({ files: [], isSameAsCurrent: false, isSameAsNodePath: false, scanDir: scanLabel }));
        }
        break;
      case 'documents':
        scanDirPath = path.join(os.homedir(), 'Documents');
        scanLabel = '~/Documents';
        break;
      case 'current':
        scanDirPath = '.';
        scanLabel = path.resolve('.');
        break;
      default:
        return fail(res, 400, '无效的目录类型');
    }
    try {
      if (!fs.existsSync(scanDirPath)) {
        return res.send(ok({ files: [], isSameAsCurrent: false, isSameAsNodePath: false, scanDir: scanLabel }));
      }
      const realScan = fs.realpathSync(scanDirPath);
      const realCurrent = fs.realpathSync('.');
      const isSameAsCurrent = realScan === realCurrent;
      let isSameAsNodePath = false;
      if (process.env.NODE_PATH && fs.existsSync(process.env.NODE_PATH)) {
        isSameAsNodePath = realScan === fs.realpathSync(process.env.NODE_PATH);
      }
      const files = scanDir(realScan);
      files.sort((a, b) => (a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : b.modified - a.modified));
      res.send(ok({ files, isSameAsCurrent, isSameAsNodePath, scanDir: scanLabel }));
    } catch (e) {
      fail(res, 500, '扫描失败: ' + e.message);
    }
  });

  fastify.post('/database/delete', async (req, res) => {
    const filePath = req.body?.path;
    if (!filePath) return fail(res, 400, '文件路径不能为空');
    if (!filePath.endsWith('.json')) return fail(res, 400, '只能删除 .json 文件');
    if (filePath.includes('..')) return fail(res, 400, '非法路径');
    try {
      if (!fs.existsSync(filePath)) return fail(res, 404, '文件不存在');
      fs.unlinkSync(filePath);
      res.send(ok(null, '删除成功'));
    } catch (e) {
      fail(res, 500, '删除失败: ' + e.message);
    }
  });

  fastify.post('/database/migrate', async (_req, res) => {
    const nodePath = process.env.NODE_PATH;
    if (!nodePath) return fail(res, 400, 'NODE_PATH 未设置');
    if (!fs.existsSync(nodePath)) return fail(res, 400, 'NODE_PATH 目录不存在');
    const docs = path.join(os.homedir(), 'Documents');
    if (!fs.existsSync(docs)) return fail(res, 400, 'Documents 目录不存在');
    try {
      const jsonFiles = fs.readdirSync(docs).filter((f) => f.endsWith('.json'));
      if (!jsonFiles.length) return res.send(ok({ copied: 0 }, 'Documents 目录中没有 .json 文件'));
      let copied = 0;
      for (const file of jsonFiles) {
        try {
          fs.copyFileSync(path.join(docs, file), path.join(nodePath, file));
          copied++;
        } catch (e) {
          console.error(`复制文件失败 ${file}:`, e);
        }
      }
      if (!copied) return fail(res, 500, '所有文件复制失败');
      res.send(ok({ copied }, `成功复制 ${copied} 个文件`));
    } catch (e) {
      fail(res, 500, '迁移失败: ' + e.message);
    }
  });

  fastify.get('/database/view-file', async (req, res) => {
    const filePath = req.query?.path;
    if (!filePath) return fail(res, 400, '文件路径不能为空');
    if (filePath.includes('..')) return fail(res, 400, '非法路径');
    if (!filePath.endsWith('.json')) return fail(res, 400, '只能查看 JSON 文件');
    try {
      if (!fs.existsSync(filePath)) return fail(res, 404, '文件不存在');
      const content = fs.readFileSync(filePath, 'utf8');
      JSON.parse(content);
      res.send(ok({ content }));
    } catch (e) {
      fail(res, 500, e instanceof SyntaxError ? '文件不是有效的 JSON 格式' : '查看失败: ' + e.message);
    }
  });

  fastify.get('/database/download-file', async (req, res) => {
    const filePath = req.query?.path;
    if (!filePath || filePath.includes('..')) return res.code(400).send('非法路径');
    if (!fs.existsSync(filePath)) return res.code(404).send('文件不存在');
    const content = fs.readFileSync(filePath, 'utf8');
    return res
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`)
      .send(content);
  });

  async function readDbFile() {
    const base = process.env.NODE_PATH || '.';
    const file = path.join(base, getDbFileName());
    if (!fs.existsSync(file)) throw new Error('数据库文件不存在');
    return { file, content: fs.readFileSync(file, 'utf8') };
  }

  fastify.get('/backup', async (_req, res) => {
    try {
      const { content } = await readDbFile();
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
      return res
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${getDbFileName().replace('.json', '')}_${stamp}.db.json"`)
        .send(content);
    } catch (e) {
      return res.code(500).send('备份失败: ' + e.message);
    }
  });

  async function importBackup(req, res, content) {
    if (!content) return fail(res, 400, '请提供文件内容');
    try {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      const base = process.env.NODE_PATH || '.';
      const file = path.join(base, getDbFileName());
      fs.writeFileSync(file, JSON.stringify(parsed, null, 4), 'utf8');
      try {
        req.server.db = new JsonDB(new Config(file, true, true, '/', true));
      } catch (e) {
        return res.send(ok({ requiresRestart: true }, '导入成功，但需要重启服务器才能生效'));
      }
      res.send(ok(null, '导入成功'));
    } catch (e) {
      fail(res, 500, e instanceof SyntaxError ? '文件内容不是有效的 JSON 格式' : '导入失败: ' + e.message);
    }
  }

  fastify.post('/backup', async (req, res) => importBackup(req, res, req.body?.content));

  fastify.put('/backup', async (req, res) => importBackup(req, res, req.body));

  fastify.get('/m3u8', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('m3u8'));
    try {
      res.send(ok({ settings: await getM3u8Settings(db(req)), stats: getM3u8Stats() }));
    } catch (e) {
      fail(res, 500, '读取失败: ' + e.message);
    }
  });

  fastify.post('/m3u8/settings', async (req, res) => {
    try {
      const settings = await setM3u8Settings(db(req), req.body || {});
      res.send(ok({ settings }, '配置保存成功，已生效'));
    } catch (e) {
      fail(res, 500, '保存失败: ' + e.message);
    }
  });

  fastify.post('/m3u8/reset', async (req, res) => {
    try {
      const settings = await resetM3u8Settings(db(req));
      res.send(ok({ settings }, '已恢复默认参数'));
    } catch (e) {
      fail(res, 500, '重置失败: ' + e.message);
    }
  });

  fastify.get('/test', async (_req, res) => {
    res.type('text/html').send(loadPage('test'));
  });

  fastify.get('/cookies', async (req, res) => {
    if (wantsHtml(req)) return res.type('text/html').send(loadPage('cookies'));
    try {
      res.send(ok(await listCookiePayload(db(req))));
    } catch (e) {
      fail(res, 500, '读取失败: ' + e.message);
    }
  });

  fastify.get('/cookies/data', async (req, res) => {
    try {
      res.send(ok(await listCookiePayload(db(req))));
    } catch (e) {
      fail(res, 500, '读取失败: ' + e.message);
    }
  });

  fastify.post('/cookies/clear', async (req, res) => {
    const domain = req.body?.domain;
    if (!domain || typeof domain !== 'string') return fail(res, 400, 'domain 不能为空');
    try {
      await cookieStore.load();
      const removed = cookieStore.clearCookies(domain);
      if (removed > 0) await cookieStore.save(true);
      res.send(ok({ removed }, `已清除 ${domain} 的 ${removed} 个 Cookie`));
    } catch (e) {
      fail(res, 500, '清除失败: ' + e.message);
    }
  });

  fastify.post('/cookies/clear-all', async (req, res) => {
    try {
      await cookieStore.load();
      const removed = cookieStore.clearAllCookies();
      if (removed > 0) await cookieStore.save(true);
      const dbRemoved = await clearDbCookies(db(req));
      const suffix = dbRemoved > 0 ? `，数据库 Cookie 配置 ${dbRemoved} 处` : '';
      res.send(ok({ removed, dbRemoved }, `已清空全部 Cookie（运行 ${removed} 个${suffix}）`));
    } catch (e) {
      fail(res, 500, '清空失败: ' + e.message);
    }
  });

  fastify.post('/site', async (req, res) => {
    if (req.body?.missav !== undefined) await setSite(db(req), 'missav', req.body.missav);
    res.send(ok(null, '域名配置保存成功'));
  });

  fastify.post('/jable-actors', async (req, res) => {
    const actors = req.body?.actors;
    if (!Array.isArray(actors)) return fail(res, 400, '无效的演员列表数据');
    await setJableActors(db(req), actors);
    res.send(ok(null, 'Jable 演员列表保存成功'));
  });

  fastify.post('/jable-actors/reset', async (req, res) => {
    const data = await resetJableActors(db(req));
    res.send(ok(data, '已重置为默认演员列表'));
  });

  fastify.post('/missav-actors', async (req, res) => {
    const actors = req.body?.actors;
    if (!Array.isArray(actors)) return fail(res, 400, '无效的演员列表数据');
    await setMissavActors(db(req), actors);
    res.send(ok(null, 'MissAV 演员列表保存成功'));
  });

  fastify.post('/missav-actors/reset', async (req, res) => {
    const data = await resetMissavActors(db(req));
    res.send(ok(data, '已重置为默认演员列表'));
  });
}
