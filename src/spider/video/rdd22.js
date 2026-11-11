// 肉多多视频 91rdd (https://www.rdd22.top) -> CatPawOpen spider
// 站点结构: 列表走 JSON API, 详情页直给 m3u8, 无墙无门 (直连 200)。
// 列表 API: /factory/api/category.php?id=<分类id>&field=category_id|parent_category_id&sort=latest&page=<N>
//   返回 {status, data:[{id,title,tags,cover_image_url,url,category,parent_category_id,content_id,created_at_timestamp}], pagination:{totalHits,page,limit:12}}
// 搜索 API: /factory/api/search.php?q=<词>&type=video&sort=latest&page=<N> (同格式, 另有 counts)
// 详情页: /videos/<前3位>/<id>.html, 播放器 <div class="video-player-container" data-m3u8="..."> 直给 m3u8, <video poster> 为封面, <h1> 为标题。
// 单档实话: 每片只有一条 m3u8 (master 恰好 1 个变体, 多为 1280x720/2000k, 个别 720x406/1500k; fqm3u8 的则是直出 media 清单),
// 站方只给一条流, 无分辨率可选, 不编档位; 详情直接回 master 地址, 播放器自行跟变体。
// 分片是 .jpg 后缀伪装的 TS (个别 AES-128), iOS 原生 HLS 可播; 封面直链无防盗链 (.jpg 与 .avif 均 200)。
// 分类: 首页最新 (国产452+番号453 两父级最新合并按时间排) + 热门排行 (首页国产排行 10 条, 单页) + 国产全部 + 番号全部
//   + 25 个视频分类 + 刷视频 (竖屏 feed, 单页 12 条) + 153 个标签 (标签云原序, 走搜索 API)。
// 不进分类: 成人小说/动图专区/美图写真/成人漫画 (图文无视频)、番号磁力/国产磁力 (磁力无流)。
// 注意: 域名来自用户给的 https://www.rdd22.top/home; HOST 是文件顶部单一常量, 改一处即可; 未发现备用域, 未猜。
// 门: 本站当前无门; getHtml 内留了与悟空同款的 xk_gate 过门兜底 (若日后站方加门, 自动取 token 设 Cookie 再取), 未碰任何统计像素。
import req from '../../util/req.js';

const KEY = 'py_rdd22';
const NAME = '💋肉多多';
const HOST = 'https://www.rdd22.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// gate cookie 缓存 (本站当前无门; 若日后加门, 复用悟空同款逻辑)
let gateCookie = '';

const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'hot', type_name: '热门排行' },
  { type_id: 'p452', type_name: '国产全部' },
  { type_id: 'p453', type_name: '番号全部' },
  { type_id: 'c454', type_name: '国产传媒' },
  { type_id: 'c455', type_name: '探花交友' },
  { type_id: 'c456', type_name: '网曝黑料' },
  { type_id: 'c457', type_name: '绿帽出轨' },
  { type_id: 'c458', type_name: '国产乱伦' },
  { type_id: 'c460', type_name: '主播自拍' },
  { type_id: 'c461', type_name: '户外露出' },
  { type_id: 'c490', type_name: '福利姬' },
  { type_id: 'c462', type_name: '中文字幕' },
  { type_id: 'c463', type_name: '无码破解' },
  { type_id: 'c464', type_name: '熟女人妻' },
  { type_id: 'c465', type_name: '巨乳美乳' },
  { type_id: 'c466', type_name: '少女萝莉' },
  { type_id: 'c468', type_name: '强奸乱伦' },
  { type_id: 'c469', type_name: 'SM调教' },
  { type_id: 'c489', type_name: 'VR视角' },
  { type_id: 'c459', type_name: '剧情演绎' },
  { type_id: 'c467', type_name: '制服诱惑' },
  { type_id: 'c483', type_name: '欧美视频' },
  { type_id: 'c484', type_name: '成人动漫' },
  { type_id: 'c485', type_name: '三级伦理' },
  { type_id: 'c486', type_name: 'AI换脸' },
  { type_id: 'c487', type_name: 'AV解说' },
  { type_id: 'c488', type_name: '女同性恋' },
  { type_id: 'c1160', type_name: 'AI短剧' },
  { type_id: 'brush', type_name: '刷视频' },
  { type_id: 'tag:动漫', type_name: '标签·动漫' },
  { type_id: 'tag:生姦', type_name: '标签·生姦' },
  { type_id: 'tag:老人', type_name: '标签·老人' },
  { type_id: 'tag:喷水', type_name: '标签·喷水' },
  { type_id: 'tag:轮奸', type_name: '标签·轮奸' },
  { type_id: 'tag:自慰', type_name: '标签·自慰' },
  { type_id: 'tag:御姐', type_name: '标签·御姐' },
  { type_id: 'tag:黑逼', type_name: '标签·黑逼' },
  { type_id: 'tag:熟女', type_name: '标签·熟女' },
  { type_id: 'tag:深喉', type_name: '标签·深喉' },
  { type_id: 'tag:肉感', type_name: '标签·肉感' },
  { type_id: 'tag:五十路', type_name: '标签·五十路' },
  { type_id: 'tag:学生', type_name: '标签·学生' },
  { type_id: 'tag:少妇', type_name: '标签·少妇' },
  { type_id: 'tag:阿姨', type_name: '标签·阿姨' },
  { type_id: 'tag:人妻', type_name: '标签·人妻' },
  { type_id: 'tag:护士', type_name: '标签·护士' },
  { type_id: 'tag:空姐', type_name: '标签·空姐' },
  { type_id: 'tag:老师', type_name: '标签·老师' },
  { type_id: 'tag:姐姐', type_name: '标签·姐姐' },
  { type_id: 'tag:女友', type_name: '标签·女友' },
  { type_id: 'tag:主播', type_name: '标签·主播' },
  { type_id: 'tag:技师', type_name: '标签·技师' },
  { type_id: 'tag:妈妈', type_name: '标签·妈妈' },
  { type_id: 'tag:闺蜜', type_name: '标签·闺蜜' },
  { type_id: 'tag:老婆', type_name: '标签·老婆' },
  { type_id: 'tag:同事', type_name: '标签·同事' },
  { type_id: 'tag:乳交', type_name: '标签·乳交' },
  { type_id: 'tag:内射', type_name: '标签·内射' },
  { type_id: 'tag:颜射', type_name: '标签·颜射' },
  { type_id: 'tag:口爆', type_name: '标签·口爆' },
  { type_id: 'tag:双飞', type_name: '标签·双飞' },
  { type_id: 'tag:强推', type_name: '标签·强推' },
  { type_id: 'tag:吞精', type_name: '标签·吞精' },
  { type_id: 'tag:出轨', type_name: '标签·出轨' },
  { type_id: 'tag:多p', type_name: '标签·多p' },
  { type_id: 'tag:打飞机', type_name: '标签·打飞机' },
  { type_id: 'tag:嫖娼', type_name: '标签·嫖娼' },
  { type_id: 'tag:失禁', type_name: '标签·失禁' },
  { type_id: 'tag:足交', type_name: '标签·足交' },
  { type_id: 'tag:露出', type_name: '标签·露出' },
  { type_id: 'tag:丰满', type_name: '标签·丰满' },
  { type_id: 'tag:长腿', type_name: '标签·长腿' },
  { type_id: 'tag:大屁股', type_name: '标签·大屁股' },
  { type_id: 'tag:蜜桃臀', type_name: '标签·蜜桃臀' },
  { type_id: 'tag:娇小', type_name: '标签·娇小' },
  { type_id: 'tag:翘臀', type_name: '标签·翘臀' },
  { type_id: 'tag:苗条', type_name: '标签·苗条' },
  { type_id: 'tag:肥臀', type_name: '标签·肥臀' },
  { type_id: 'tag:微胖', type_name: '标签·微胖' },
  { type_id: 'tag:美腿', type_name: '标签·美腿' },
  { type_id: 'tag:高挑', type_name: '标签·高挑' },
  { type_id: 'tag:e奶', type_name: '标签·e奶' },
  { type_id: 'tag:黑丝', type_name: '标签·黑丝' },
  { type_id: 'tag:JK', type_name: '标签·JK' },
  { type_id: 'tag:眼镜', type_name: '标签·眼镜' },
  { type_id: 'tag:丝袜', type_name: '标签·丝袜' },
  { type_id: 'tag:蕾丝', type_name: '标签·蕾丝' },
  { type_id: 'tag:女仆', type_name: '标签·女仆' },
  { type_id: 'tag:白丝', type_name: '标签·白丝' },
  { type_id: 'tag:双马尾', type_name: '标签·双马尾' },
  { type_id: 'tag:肉丝', type_name: '标签·肉丝' },
  { type_id: 'tag:高跟', type_name: '标签·高跟' },
  { type_id: 'tag:瑜伽裤', type_name: '标签·瑜伽裤' },
  { type_id: 'tag:短裙', type_name: '标签·短裙' },
  { type_id: 'tag:兔女郎', type_name: '标签·兔女郎' },
  { type_id: 'tag:紧身裤', type_name: '标签·紧身裤' },
  { type_id: 'tag:包臀裙', type_name: '标签·包臀裙' },
  { type_id: 'tag:开档', type_name: '标签·开档' },
  { type_id: 'tag:被强奸', type_name: '标签·被强奸' },
  { type_id: 'tag:极品女神', type_name: '标签·极品女神' },
  { type_id: 'tag:乱伦国产', type_name: '标签·乱伦国产' },
  { type_id: 'tag:骚妻', type_name: '标签·骚妻' },
  { type_id: 'tag:萝莉', type_name: '标签·萝莉' },
  { type_id: 'tag:柏木', type_name: '标签·柏木' },
  { type_id: 'tag:巨乳人妻', type_name: '标签·巨乳人妻' },
  { type_id: 'tag:社长', type_name: '标签·社长' },
  { type_id: 'tag:凌辱母', type_name: '标签·凌辱母' },
  { type_id: 'tag:鱼子酱', type_name: '标签·鱼子酱' },
  { type_id: 'tag:无码', type_name: '标签·无码' },
  { type_id: 'tag:颜射合集', type_name: '标签·颜射合集' },
  { type_id: 'tag:小倉奈々', type_name: '标签·小倉奈々' },
  { type_id: 'tag:女同性恋', type_name: '标签·女同性恋' },
  { type_id: 'tag:换脸', type_name: '标签·换脸' },
  { type_id: 'tag:美鲍', type_name: '标签·美鲍' },
  { type_id: 'tag:殘忍畫面', type_name: '标签·殘忍畫面' },
  { type_id: 'tag:淫乱', type_name: '标签·淫乱' },
  { type_id: 'tag:中文字幕', type_name: '标签·中文字幕' },
  { type_id: 'tag:合集', type_name: '标签·合集' },
  { type_id: 'tag:回春', type_name: '标签·回春' },
  { type_id: 'tag:极品御姐', type_name: '标签·极品御姐' },
  { type_id: 'tag:传媒', type_name: '标签·传媒' },
  { type_id: 'tag:巨乳', type_name: '标签·巨乳' },
  { type_id: 'tag:熟女人妻', type_name: '标签·熟女人妻' },
  { type_id: 'tag:修仙', type_name: '标签·修仙' },
  { type_id: 'tag:按摩', type_name: '标签·按摩' },
  { type_id: 'tag:乱伦', type_name: '标签·乱伦' },
  { type_id: 'tag:探花', type_name: '标签·探花' },
  { type_id: 'tag:口活', type_name: '标签·口活' },
  { type_id: 'tag:操我', type_name: '标签·操我' },
  { type_id: 'tag:真实', type_name: '标签·真实' },
  { type_id: 'tag:欧美', type_name: '标签·欧美' },
  { type_id: 'tag:女儿', type_name: '标签·女儿' },
  { type_id: 'tag:短篇全集', type_name: '标签·短篇全集' },
  { type_id: 'tag:双插', type_name: '标签·双插' },
  { type_id: 'tag:肛交', type_name: '标签·肛交' },
  { type_id: 'tag:反差', type_name: '标签·反差' },
  { type_id: 'tag:電车', type_name: '标签·電车' },
  { type_id: 'tag:女神', type_name: '标签·女神' },
  { type_id: 'tag:小野', type_name: '标签·小野' },
  { type_id: 'tag:上司', type_name: '标签·上司' },
  { type_id: 'tag:巨乳眼镜妹', type_name: '标签·巨乳眼镜妹' },
  { type_id: 'tag:内衣', type_name: '标签·内衣' },
  { type_id: 'tag:本郷愛', type_name: '标签·本郷愛' },
  { type_id: 'tag:母子', type_name: '标签·母子' },
  { type_id: 'tag:高颜值', type_name: '标签·高颜值' },
  { type_id: 'tag:榨干', type_name: '标签·榨干' },
  { type_id: 'tag:偷拍', type_name: '标签·偷拍' },
  { type_id: 'tag:网爆', type_name: '标签·网爆' },
  { type_id: 'tag:口交学', type_name: '标签·口交学' },
  { type_id: 'tag:黑人', type_name: '标签·黑人' },
  { type_id: 'tag:炮友', type_name: '标签·炮友' },
  { type_id: 'tag:沙龙', type_name: '标签·沙龙' },
  { type_id: 'tag:后入', type_name: '标签·后入' },
  { type_id: 'tag:勾引', type_name: '标签·勾引' },
  { type_id: 'tag:展示', type_name: '标签·展示' },
  { type_id: 'tag:美少年', type_name: '标签·美少年' },
  { type_id: 'tag:羽月希', type_name: '标签·羽月希' },
  { type_id: 'tag:女操男', type_name: '标签·女操男' },
  { type_id: 'tag:跳跳', type_name: '标签·跳跳' },
  { type_id: 'tag:孕妇', type_name: '标签·孕妇' },
  { type_id: 'tag:银行', type_name: '标签·银行' },
  { type_id: 'tag:制服美少女', type_name: '标签·制服美少女' },
  { type_id: 'tag:健身', type_name: '标签·健身' },
  { type_id: 'tag:调教', type_name: '标签·调教' },
  { type_id: 'tag:极品自慰', type_name: '标签·极品自慰' },
  { type_id: 'tag:同学', type_name: '标签·同学' },
  { type_id: 'tag:多毛', type_name: '标签·多毛' },
  { type_id: 'tag:体液', type_name: '标签·体液' },
  { type_id: 'tag:风骚', type_name: '标签·风骚' },
  { type_id: 'tag:红楼', type_name: '标签·红楼' },
  { type_id: 'tag:結婚', type_name: '标签·結婚' },
  { type_id: 'tag:情侣自拍', type_name: '标签·情侣自拍' },
  { type_id: 'tag:短剧', type_name: '标签·短剧' },
  { type_id: 'tag:露乳', type_name: '标签·露乳' },
  { type_id: 'tag:跳蛋', type_name: '标签·跳蛋' },
  { type_id: 'tag:吃鸡巴', type_name: '标签·吃鸡巴' },
  { type_id: 'tag:名媛', type_name: '标签·名媛' },
  { type_id: 'tag:小骚逼', type_name: '标签·小骚逼' },
  { type_id: 'tag:女同', type_name: '标签·女同' },
  { type_id: 'tag:骚气', type_name: '标签·骚气' },
  { type_id: 'tag:醉酒', type_name: '标签·醉酒' },
  { type_id: 'tag:秀人网', type_name: '标签·秀人网' },
];

function headers(isJson) {
  const h = {
    'User-Agent': UA,
    'Accept': isJson ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/home',
  };
  if (gateCookie) h['Cookie'] = gateCookie;
  return h;
}

function isGatePage(html) {
  return !!html && html.indexOf('xkEnter') !== -1 && /var token='[^']+'/.test(html);
}

function extractGateToken(html) {
  const m = html.match(/var token='([^']+)'/);
  return m ? m[1] : '';
}

async function rawGet(url, isJson) {
  try {
    const { data } = await req.get(url, { headers: headers(isJson), timeout: 20000 });
    return String(data || '');
  } catch (e) { /* fall through to fetch */ }
  try {
    if (typeof fetch === 'function') {
      const r = await fetch(url, { headers: headers(isJson), signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.text();
    }
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 取页: 先 GET; 若回 gate 页 (含 xkEnter + var token), 取 token 设 Cookie 再 GET 一次,
 * cookie 缓存到 gateCookie 供后续调用复用; 若某次调用又命中 gate 页 (cookie 过期), 重新取 token。
 * 本站当前无门, 该分支平时不触发, 只作兜底。
 */
async function getHtml(url, isJson) {
  let html = await rawGet(url, isJson);
  if (isGatePage(html)) {
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url, isJson);
    }
  }
  if (isGatePage(html)) {
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url, isJson);
    }
  }
  return isGatePage(html) ? '' : html;
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

/** API 条目 -> 卡片 (vod_id 用详情相对地址, detail 直接 GET 它) */
function apiToCard(it) {
  if (!it || !it.url) return null;
  const tags = Array.isArray(it.tags) ? it.tags.filter(Boolean) : [];
  return {
    vod_id: String(it.url),
    vod_name: decodeHtml(it.title) || ('视频 ' + (it.content_id || '')),
    vod_pic: absUrl(it.cover_image_url),
    vod_remarks: (it.category ? String(it.category) : '') + (tags.length ? ' ' + tags.slice(0, 3).join(' ') : ''),
  };
}

function parseApiList(text) {
  const out = [];
  if (!text) return out;
  let j = null;
  try { j = JSON.parse(text); } catch (e) { return out; }
  const arr = Array.isArray(j.data) ? j.data : [];
  const seen = new Set();
  for (const it of arr) {
    const card = apiToCard(it);
    if (!card || seen.has(card.vod_id)) continue;
    seen.add(card.vod_id);
    out.push(card);
  }
  return out;
}

function apiPageInfo(text) {
  try {
    const j = JSON.parse(text || '{}');
    const p = j.pagination || {};
    const total = parseInt(p.totalHits, 10) || 0;
    const limit = parseInt(p.limit, 10) || 12;
    return { total, pagecount: total > 0 ? Math.ceil(total / limit) : 999, limit };
  } catch (e) {
    return { total: 999 * 12, pagecount: 999, limit: 12 };
  }
}

async function catApi(id, field, page) {
  const url = HOST + '/factory/api/category.php?id=' + encodeURIComponent(id)
    + '&field=' + encodeURIComponent(field) + '&sort=latest&page=' + page;
  const text = await getHtml(url, true);
  return { list: parseApiList(text), info: apiPageInfo(text) };
}

async function searchApi(q, page) {
  const url = HOST + '/factory/api/search.php?q=' + encodeURIComponent(q)
    + '&type=video&sort=latest&page=' + page;
  const text = await getHtml(url, true);
  return { list: parseApiList(text), info: apiPageInfo(text) };
}

/** 首页最新: 国产父级 452 与番号父级 453 的最新各取一页, 合并按 created_at_timestamp 倒序 */
async function homeLatest(page) {
  const [a, b] = await Promise.all([
    (async () => {
      const text = await getHtml(HOST + '/factory/api/category.php?id=452&field=parent_category_id&sort=latest&page=' + page, true);
      let raw = [];
      try { raw = (JSON.parse(text).data || []); } catch (e) { raw = []; }
      return raw;
    })(),
    (async () => {
      const text = await getHtml(HOST + '/factory/api/category.php?id=453&field=parent_category_id&sort=latest&page=' + page, true);
      let raw = [];
      try { raw = (JSON.parse(text).data || []); } catch (e) { raw = []; }
      return raw;
    })(),
  ]);
  const merged = a.concat(b);
  merged.sort((x, y) => (Number(y.created_at_timestamp) || 0) - (Number(x.created_at_timestamp) || 0));
  const seen = new Set();
  const list = [];
  for (const it of merged) {
    const card = apiToCard(it);
    if (!card || seen.has(card.vod_id)) continue;
    seen.add(card.vod_id);
    list.push(card);
  }
  return { list, pagecount: 423 };
}

/** 热门排行: 首页国产排行 10 条 (单页; 只取 active 的第一个 ranking-content 块) */
function parseHot(html) {
  const out = [];
  if (!html) return out;
  let block = html;
  const start = html.indexOf('ranking-content active');
  if (start !== -1) {
    const next = html.indexOf('ranking-content', start + 10);
    block = next !== -1 ? html.slice(start, next) : html.slice(start);
  }
  const re = /<a href="(\/videos\/\d+\/\d+\.html)"[^>]*>[\s\S]*?data-smart-src="([^"]+)"[^>]*?alt="([^"]*)"/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(block)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({
      vod_id: m[1],
      vod_name: decodeHtml(m[3]) || m[1],
      vod_pic: absUrl(m[2]),
      vod_remarks: '热门排行',
    });
  }
  return out;
}

/** 刷视频: /shuashipin/ 竖屏 feed, 每 slide 一条 (单页) */
function parseBrush(html) {
  const out = [];
  if (!html) return out;
  const re = /<section class="brush-slide"[^>]*>[\s\S]*?<a href="(\/videos\/\d+\/\d+\.html)">[\s\S]*?<div class="brush-title">([^<]+)<\/div>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const chunk = html.slice(Math.max(0, m.index - 200), m.index + 400);
    const pic = (chunk.match(/poster="([^"]+)"/) || [])[1] || '';
    out.push({
      vod_id: m[1],
      vod_name: decodeHtml(m[2]) || m[1],
      vod_pic: absUrl(pic),
      vod_remarks: '刷视频',
    });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<h1[^>]*>([^<]{2,300})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1].split(/[-|_｜]/)[0]);
  return fallback || '';
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'home');

  if (id === 'home' || id === '') {
    const r = await homeLatest(page);
    return { page, pagecount: r.pagecount, limit: r.list.length || 24, total: r.pagecount * 24, list: r.list };
  }
  if (id === 'hot') {
    if (page > 1) return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    const html = await getHtml(HOST + '/home');
    const list = parseHot(html);
    return { page, pagecount: 1, limit: list.length || 10, total: list.length, list };
  }
  if (id === 'brush') {
    if (page > 1) return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    const html = await getHtml(HOST + '/shuashipin/');
    const list = parseBrush(html);
    return { page, pagecount: 1, limit: list.length || 12, total: list.length, list };
  }
  if (id === 'p452' || id === 'p453') {
    const r = await catApi(id.slice(1), 'parent_category_id', page);
    return { page, pagecount: r.info.pagecount, limit: r.list.length || 12, total: r.info.total, list: r.list };
  }
  if (id.indexOf('c') === 0) {
    const r = await catApi(id.slice(1), 'category_id', page);
    return { page, pagecount: r.info.pagecount, limit: r.list.length || 12, total: r.info.total, list: r.list };
  }
  if (id.indexOf('tag:') === 0) {
    const r = await searchApi(id.slice(4), page);
    return { page, pagecount: r.info.pagecount, limit: r.list.length || 12, total: r.info.total, list: r.list };
  }
  return { page, pagecount: page, limit: 0, total: 0, list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let path = String(raw || '');
  if (!path) return { list: [] };
  if (!path.startsWith('/')) {
    // 数字 id 兜底: /videos/<前3位>/<id>.html
    const num = path.replace(/[^0-9]/g, '');
    if (!num) return { list: [] };
    path = '/videos/' + num.slice(0, 3) + '/' + num + '.html';
  }
  const html = await getHtml(HOST + path);
  if (!html) return { list: [] };

  const m3u8 = (html.match(/data-m3u8="([^"]+)"/) || [])[1] || '';
  if (!m3u8 || !/^https?:\/\//i.test(m3u8)) return { list: [] };

  const name = extractTitle(html, path);
  const pic = absUrl((html.match(/<video[^>]+poster="([^"]+)"/) || [])[1] || '');
  const desc = decodeHtml((html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '');
  const tagList = [];
  const tre = /href="\/search\.php\?q=[^"]+"[^>]*>([^<]{1,20})<\/a>/g;
  let tx;
  while ((tx = tre.exec(html)) !== null) {
    const tag = decodeHtml(tx[1]);
    if (tag && tagList.indexOf(tag) === -1) tagList.push(tag);
  }
  const content = (tagList.length ? '标签：' + tagList.join(' / ') + '\n' : '') + desc;

  // 字幕：按 m3u8 地址 + 详情 path 登记片名，后台预热（不 await）
  subCacheName(m3u8, name);
  subCacheName(path, name);
  subWarm(m3u8);

  return {
    list: [{
      vod_id: path,
      vod_name: name || path,
      vod_pic: pic,
      vod_type: '',
      vod_remarks: tagList.slice(0, 5).join(' '),
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: '正片$' + m3u8,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let url = String(body.id || '');
  if (url.includes('$')) url = url.split('$').pop().trim();
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const r = await searchApi(wd, page);
  return {
    page,
    pagecount: r.info.pagecount,
    limit: r.list.length || 12,
    total: r.info.total,
    list: r.list,
  };
}

// ---------------- 字幕聚合接线（2026-11-11） ----------------
// reqRaw + clean：字幕芯（subcore.js，2026-11-02 定版）需要的两个伴生 helpers，芯本身不含；
// 与已接芯的 py_javtiful 同款。芯原文逐字粘贴在后，未改一字。
async function reqRaw(url, headers, timeoutMs) {
  try {
    const r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof r.data === 'string' ? r.data : (r.data === null || r.data === undefined ? '' : JSON.stringify(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();
const subResultCache = new Map();

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
}

function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b[A-Z]{2,10}[- ]\d{2,8}[A-Z]?\b/,
    /\b[A-Z]{2,10}\d{2,8}[A-Z]?\b/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) return m[0].replace(/\s+/g, '-').replace(/-+/g, '-');
  }
  return '';
}

function subCtx(durl) {
  const title = (subNameCache.get(durl) || subSlugTitle(durl) || '').trim();
  const code = subExtractCode(title) || subExtractCode(String(durl || ''));
  const compact = code ? code.replace(/[-_ ]/g, '') : '';
  let titlePart = '';
  if (code && title) {
    titlePart = title
      .replace(new RegExp(code.replace(/[-_]/g, '[-_ ]?'), 'i'), ' ')
      .replace(/\b(UNCENSORED|LEAK|OTHER|COMPLETE|FULL|HDR|WEB|BLURAY|BDRIP|WEBDL|REMUX|X264|X265|10BIT|8BIT|HEVC|AVC)\b/gi, ' ')
      .replace(/\b(?:EP|E|S|SEASON)\s*\d{1,3}\b/gi, ' ')
      .replace(/^[\s\-_:]+|[\s\-_:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (titlePart === code || titlePart === compact) titlePart = '';
  }
  return { title, code, compact, titlePart };
}

function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

function subMatchOf(durl, ctx) {
  const text = ((ctx.title || '') + ' ' + String(durl || '')).trim().toLowerCase();
  const title = (ctx.title || '').toLowerCase();
  return {
    text,
    loose: text.replace(/[-_\s.]/g, ''),
    title,
    titleLoose: title.replace(/[-_\s.]/g, ''),
  };
}

function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

function subFmtOf(name, ext, url) {
  const hay = (String(name || '') + ' ' + String(url || '')).toLowerCase();
  if (/\.(zip|rar|7z)(\?|#|$)/.test(hay)) return '';
  const fromName = String(name || '').toLowerCase().match(/\.(srt|vtt|ass|ssa)$/);
  if (fromName) return fromName[1];
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (/^(srt|vtt|ass|ssa)$/.test(e)) return e;
  const fromUrl = String(url || '').match(SUB_TEXT_RE);
  if (fromUrl) return fromUrl[1].toLowerCase();
  return '';
}

function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await reqRaw('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
      { 'User-Agent': 'ForwardWidgets/1.0.2', Accept: '*/*' }, 3000);
    if (r.status !== 200 || !r.body) return [];
    let j;
    try { j = JSON.parse(r.body); } catch (e) { return []; }
    if (!j || Number(j.code) !== 0 || !Array.isArray(j.data)) return [];
    return j.data;
  })();
  ocache.set(key, p);
  return p;
}

function subNormItem(it) {
  const name = String(it.name || it.Name || it.title || it.Title || it.filename || it.FileName || '字幕');
  const langs = Array.isArray(it.languages) ? it.languages.join(',')
    : (Array.isArray(it.Languages) ? it.Languages.join(',') : String(it.langs || it.Langs || it.language || ''));
  return {
    name,
    langs,
    ext: String(it.ext || it.Ext || it.format || it.Format || ''),
    url: String(it.url || it.Url || ''),
    cid: Boolean(it.cid_match ?? it.CidMatch),
    down: Number(it.down_count || it.DownCount || it.downloads || it.Downloads || 0) || 0,
    score: Number(it.score || it.Score || 0) || 0,
    fp: Number(it.fingerprintf_score || it.fingerprint_score || it.FingerprintScore || it.fingerprintfScore || 0) || 0,
    duration: Number(it.duration || it.Duration || 0) || 0,
    size: Number(it.file_size || it.FileSize || it.size || it.Size || 0) || 0,
  };
}

function subRelevant(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  if (ctx.code) {
    if (text.includes(ctx.code.toLowerCase())) return true;
    if (ctx.compact && loose.includes(ctx.compact.toLowerCase())) return true;
  }
  if (!match.text) return false;
  return text.includes(match.text) || loose.includes(match.loose)
    || (match.title ? (text.includes(match.title) || loose.includes(match.titleLoose)) : false)
    || match.text.includes(text);
}

function subScoreItem(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  let s = (it.cid ? 100000 : 0) + it.down / 10000;
  if (ctx.code && (text.includes(ctx.code.toLowerCase()) || (ctx.compact && loose.includes(ctx.compact.toLowerCase())))) s += 25000;
  s += Math.max(0, it.score) + Math.max(0, it.fp);
  if (it.duration > 0) s += 50;
  if (it.size > 0) s += Math.min(it.size / 1024 / 1024, 20);
  if (match.title && (text.includes(match.title) || loose.includes(match.titleLoose))) s += 1000;
  if (ctx.code) s += 500;
  if (text.includes('sub') || text.includes('subtitle') || text.includes('字幕')) s += 300;
  return s;
}

async function subSlotOracle(keys, src, tier, ctx, match, ocache, bag) {
  let pool = null;
  for (const k of keys) {
    const list = await subOracle(k, ocache);
    if (list && list.length) { pool = list; break; }
  }
  if (!pool) return;
  const items = [];
  for (const raw of pool) {
    if (!raw) continue;
    const it = subNormItem(raw);
    if (!it.url) continue;
    const fmt = subFmtOf(it.name, it.ext, it.url);
    if (!fmt) continue;
    items.push({ name: it.name, langs: it.langs, ext: it.ext, url: it.url, fmt, norm: it });
  }
  if (!items.length) return;
  const finalItems = items.filter((it) => subRelevant(it, ctx, match));
  for (const it of finalItems) {
    const lang = subLangOf(it.name, it.langs);
    bag.push({ src, tier, name: subDispName(it.name, ctx.code), url: it.url, fmt: it.fmt, lang: lang.tag, langRank: lang.rank, score: subScoreItem(it.norm, ctx, match), dur: it.norm.duration });
  }
}

async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await reqRaw('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 5000);
  if (r.status !== 200 || !r.body) return;
  const pages = [];
  const seen = new Set();
  for (const m of r.body.matchAll(/href="(subs\/\d+\/[^"]+\.html)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    pages.push(m[1]);
    if (pages.length >= 3) break;
  }
  await Promise.all(pages.map(async (p) => {
    const pr = await reqRaw('https://subtitlecat.com/' + p, { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 4000);
    if (pr.status !== 200 || !pr.body) return;
    for (const m of pr.body.matchAll(/href="(\/subs\/\d+\/[^"]+\.(?:srt|vtt|ass))"/gi)) {
      let nm = m[1].split('/').pop() || '字幕';
      try { nm = decodeURIComponent(nm); } catch (e) { /* 保持原样 */ }
      if (!subRelevant({ name: nm, langs: '', ext: '' }, ctx, match)) continue;
      const lang = subLangOf(nm, '');
      const fmt = (nm.match(/\.(srt|vtt|ass)$/i) || [])[1].toLowerCase();
      bag.push({ src: 'SubtitleCat', tier: 2, name: nm, url: 'https://subtitlecat.com' + m[1], fmt, lang: lang.tag, langRank: lang.rank, score: 0 });
    }
  }));
}

function subDurSec(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  return s > 0 ? s : 0;
}
function subDurStr(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}
function subMerge(items) {
  const sorted = items.slice().sort((a, b) =>
    (a.tier - b.tier) || (a.langRank - b.langRank) || (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
  const seenUrl = new Set();
  const seenName = new Set();
  const perTier = {};
  const out = [];
  for (const it of sorted) {
    if (out.length >= 10) break;
    if (seenUrl.has(it.url)) continue;
    const nameKey = (it.lang || '') + '|' + it.name.toLowerCase().replace(/\.(srt|vtt|ass|ssa)$/i, '') + '|' + (subDurSec(it.dur) || 'nodur');
    if (seenName.has(nameKey)) continue;
    if ((perTier[it.tier] || 0) >= 8) continue;
    seenUrl.add(it.url);
    seenName.add(nameKey);
    perTier[it.tier] = (perTier[it.tier] || 0) + 1;
    const cleanName = it.name.replace(/\.(srt|vtt|ass|ssa)$/i, '').slice(0, 60);
    const dur = subDurStr(it.dur);
    out.push({ name: it.src + '·' + (it.lang ? it.lang + '·' : '') + cleanName + (dur ? '·' + dur : ''), url: it.url, format: it.fmt });
  }
  return out;
}

const subInflight = new Map();

async function subSearchAll(durl) {
  const hit = subResultCache.get(durl);
  if (hit && Date.now() - hit.ts < SUB_TTL) return hit.subs;
  if (subInflight.has(durl)) return subInflight.get(durl);
  const p = (async () => {
    const ctx = subCtx(durl);
    let subs = [];
    if (ctx.code || ctx.title) {
      const match = subMatchOf(durl, ctx);
      const bag = [];
      const ocache = new Map();
      const jobs = [
        subSlotOracle(subKeysX(ctx), '迅雷', 0, ctx, match, ocache, bag),
        subSlotOracle(subKeysXL(ctx), '迅雷看看', 1, ctx, match, ocache, bag),
        subFromSubtitleCat(ctx, match, bag),
      ].map((jp) => Promise.resolve(jp).catch(() => {}));
      const all = Promise.allSettled(jobs);
      await Promise.race([all, new Promise((r) => setTimeout(r, 6000))]);
      subs = subMerge(bag);
      if (subs.length) {
        subResultCache.set(durl, { ts: Date.now(), subs });
        if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
      } else {
        all.then(() => {
          const late = subMerge(bag);
          if (late.length) {
            subResultCache.set(durl, { ts: Date.now(), subs: late });
            if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
          }
        }).catch(() => {});
      }
    }
    return subs;
  })();
  subInflight.set(durl, p);
  try { return await p; } finally { subInflight.delete(durl); }
}

function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}

export default {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}