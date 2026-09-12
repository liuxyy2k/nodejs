import defaults from './defaults.json' with { type: 'json' };
import {
  loadSettings as loadM3u8Settings,
  saveSettings as saveM3u8Settings,
  resetSettings as resetM3u8SettingsImpl,
} from '../../util/m3u8Accel.js';

export const KEYS = {
  missavSite: '/missavSite',
  missavCookie: '/missavCookie',
  jableActors: '/jableActors',
  missavActors: '/missavActors',
  liveSources: '/liveSources',
  cmsSources: '/cmsSources',
  m3u8Accel: '/systemSettings/m3u8Accel',
};

export async function getSite(db, key) {
  try {
    const sites = await db.getData(KEYS.missavSite);
    return sites?.[key] || '';
  } catch {
    return '';
  }
}

export async function setSite(db, key, value) {
  const sites = await db.getData(KEYS.missavSite).catch(() => ({}));
  if (value) sites[key] = value;
  else delete sites[key];
  await db.push(KEYS.missavSite, sites);
}

export async function getMissavCookie(db) {
  try {
    return await db.getData(KEYS.missavCookie) || '';
  } catch {
    return '';
  }
}

export async function setMissavCookie(db, cookie) {
  await db.push(KEYS.missavCookie, cookie || '');
}

export async function getJableActors(db) {
  try {
    const list = await db.getData(KEYS.jableActors);
    if (list?.length) return list;
  } catch {}
  const list = defaults.jableActors.map((a) => ({ ...a, enabled: true }));
  if (list.length) await db.push(KEYS.jableActors, list);
  return list;
}

export async function setJableActors(db, actors) {
  await db.push(KEYS.jableActors, actors);
}

export async function resetJableActors(db) {
  const list = defaults.jableActors.map((a) => ({ ...a, enabled: true }));
  await db.push(KEYS.jableActors, list);
  return list;
}

export async function getMissavActors(db) {
  try {
    const list = await db.getData(KEYS.missavActors);
    if (list?.length) return list;
  } catch {}
  const list = defaults.missavActors.map((name) => ({ name, enabled: true }));
  if (list.length) await db.push(KEYS.missavActors, list);
  return list;
}

export async function setMissavActors(db, actors) {
  await db.push(KEYS.missavActors, actors);
}

export async function resetMissavActors(db) {
  const list = defaults.missavActors.map((name) => ({ name, enabled: true }));
  await db.push(KEYS.missavActors, list);
  return list;
}

export async function getLiveSources(db) {
  try {
    return await db.getData(KEYS.liveSources) || [];
  } catch {
    return [];
  }
}

export async function setLiveSources(db, sources) {
  await db.push(KEYS.liveSources, sources);
}

export async function getCmsSources(db) {
  try {
    return await db.getData(KEYS.cmsSources) || [];
  } catch {
    return [];
  }
}

export async function setCmsSources(db, sources) {
  await db.push(KEYS.cmsSources, sources);
}

export async function addCmsSource(db, source) {
  const list = await getCmsSources(db);
  if (list.find((s) => s.key === source.key)) {
    throw new Error(`CMS 源 key "${source.key}" 已存在`);
  }
  source.id = Date.now();
  list.push(source);
  await setCmsSources(db, list);
  return source;
}

export async function updateCmsSource(db, id, patch) {
  const list = await getCmsSources(db);
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('CMS 源不存在');
  if (patch.key && patch.key !== list[idx].key && list.find((s) => s.key === patch.key && s.id !== id)) {
    throw new Error(`CMS 源 key "${patch.key}" 已存在`);
  }
  list[idx] = { ...list[idx], ...patch };
  await setCmsSources(db, list);
  return list[idx];
}

export async function deleteCmsSource(db, id) {
  const list = (await getCmsSources(db)).filter((s) => s.id !== id);
  await setCmsSources(db, list);
}

export async function getM3u8Settings(db) {
  return loadM3u8Settings(db);
}

export async function setM3u8Settings(db, settings) {
  return saveM3u8Settings(db, settings);
}

export async function resetM3u8Settings(db) {
  return resetM3u8SettingsImpl(db);
}

export function findDbCookiePaths(obj, prefix = '', out = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj)) {
    const pathKey = `${prefix}/${key}`;
    if (key.toLowerCase().includes('cookie')) out.push(pathKey);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      findDbCookiePaths(value, pathKey, out);
    }
  }
  return out;
}

export async function clearDbCookies(db) {
  const paths = findDbCookiePaths(await db.getData('/').catch(() => ({})));
  let removed = 0;
  for (const p of paths) {
    try {
      await db.delete(p);
      removed++;
    } catch (e) {
      console.warn(`[admin] 删除数据库 Cookie 配置失败: ${p}`, e.message);
    }
  }
  return removed;
}

export function getDbFileName() {
  return `${globalThis.DB_NAME || process.env.DB || 'default'}.db.json`;
}
