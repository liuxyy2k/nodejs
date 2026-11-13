// 91porn (https://a91porn.com) -> CatPawOpen spider
// 国产自拍/网黄视频站, 服务端渲染 HTML, 无登录墙
// 详情页播放器 div 的 data-src 即 m3u8 直链, 无需二次请求
// 单档 (AES-128 媒体清单, 无多码率变体), 只出一条播放线, 不编造清晰度
// 封面与 m3u8 均无 Referer 门禁, 可直链
// VIP 区 /vip/videos 为付费墙, 不进蜘蛛
import req from '../../util/req.js';

const KEY = 'py_a91porn';
const NAME = '🎞️91porn';
const HOST = 'https://a91porn.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 12 个排序 + 热门前 92 个标签 (全部 792 个标签平铺太乱, 只取前 92)
// 标签 type_id 用 'tag:<slug>' 区分, 排序 type_id 即路径段 ('' = 最新首页)
const CLASSES = [
  { type_id: '', type_name: '最新' },
  { type_id: 'remen', type_name: '当前最热' },
  { type_id: 'benyue', type_name: '本月最热' },
  { type_id: 'yuanchuang', type_name: '91原创' },
  { type_id: 'jiajing', type_name: '最近加精' },
  { type_id: 'benyue-shoucang', type_name: '本月收藏' },
  { type_id: 'jingdian', type_name: '收藏最多' },
  { type_id: 'gaoqing', type_name: '高清' },
  { type_id: 'meiyue', type_name: '每月最热' },
  { type_id: 'taolun', type_name: '本月讨论' },
  { type_id: 'changpian', type_name: '10分钟以上' },
  { type_id: 'chaochang', type_name: '20分钟以上' },
  { type_id: 'tag:qinglv', type_name: '情侣' },
  { type_id: 'tag:nvshang', type_name: '女上' },
  { type_id: 'tag:3p', type_name: '3P' },
  { type_id: 'tag:tanhua', type_name: '探花' },
  { type_id: 'tag:gaoyanzhi', type_name: '高颜值' },
  { type_id: 'tag:dannan', type_name: '单男' },
  { type_id: 'tag:saohua', type_name: '骚话' },
  { type_id: 'tag:wanghong', type_name: '网红' },
  { type_id: 'tag:baocao', type_name: '爆操' },
  { type_id: 'tag:zujiao', type_name: '足交' },
  { type_id: 'tag:lvmao', type_name: '绿帽' },
  { type_id: 'tag:qingchun', type_name: '清纯' },
  { type_id: 'tag:saoxue', type_name: '骚穴' },
  { type_id: 'tag:dajiba', type_name: '大鸡巴' },
  { type_id: 'tag:zhangtui', type_name: '长腿' },
  { type_id: 'tag:jiaochuang', type_name: '叫床' },
  { type_id: 'tag:xiaomugou', type_name: '小母狗' },
  { type_id: 'tag:daxue', type_name: '大学' },
  { type_id: 'tag:yujie', type_name: '御姐' },
  { type_id: 'tag:gaogen', type_name: '高跟' },
  { type_id: 'tag:hangzhou', type_name: '杭州' },
  { type_id: 'tag:weipang', type_name: '微胖' },
  { type_id: 'tag:jujia', type_name: '居家' },
  { type_id: 'tag:langjiao', type_name: '浪叫' },
  { type_id: 'tag:ayi', type_name: '阿姨' },
  { type_id: 'tag:nvshen', type_name: '女神' },
  { type_id: 'tag:gouyin', type_name: '勾引' },
  { type_id: 'tag:saomugou', type_name: '骚母狗' },
  { type_id: 'tag:touqing', type_name: '偷情' },
  { type_id: 'tag:yanjing', type_name: '眼镜' },
  { type_id: 'tag:suren', type_name: '素人' },
  { type_id: 'tag:laoshi', type_name: '老师' },
  { type_id: 'tag:fennen', type_name: '粉嫩' },
  { type_id: 'tag:jiejie', type_name: '姐姐' },
  { type_id: 'tag:bailing', type_name: '白领' },
  { type_id: 'tag:chunv', type_name: '处女' },
  { type_id: 'tag:penshui', type_name: '喷水' },
  { type_id: 'tag:qun-p', type_name: '群P' },
  { type_id: 'tag:zishi', type_name: '姿势' },
  { type_id: 'tag:qingquneiyi', type_name: '情趣内衣' },
  { type_id: 'tag:dazhuang', type_name: '打桩' },
  { type_id: 'tag:tianbi', type_name: '舔逼' },
  { type_id: 'tag:koubao', type_name: '口爆' },
  { type_id: 'tag:diyishijiao', type_name: '第一视角' },
  { type_id: 'tag:mote', type_name: '模特' },
  { type_id: 'tag:xiaojiejie', type_name: '小姐姐' },
  { type_id: 'tag:fuqi', type_name: '夫妻' },
  { type_id: 'tag:shenhou', type_name: '深喉' },
  { type_id: 'tag:dadiao', type_name: '大屌' },
  { type_id: 'tag:zhajing', type_name: '榨精' },
  { type_id: 'tag:chaochui', type_name: '潮吹' },
  { type_id: 'tag:baihu', type_name: '白虎' },
  { type_id: 'tag:luchu', type_name: '露出' },
  { type_id: 'tag:saoqi', type_name: '骚妻' },
  { type_id: 'tag:rousi', type_name: '肉丝' },
  { type_id: 'tag:xifu', type_name: '媳妇' },
  { type_id: 'tag:huwai', type_name: '户外' },
  { type_id: 'tag:xiaosaohuo', type_name: '小骚货' },
  { type_id: 'tag:baijiang', type_name: '白浆' },
  { type_id: 'tag:zhenshi', type_name: '真实' },
  { type_id: 'tag:jingshenxiaomei', type_name: '精神小妹' },
  { type_id: 'tag:gangjiao', type_name: '肛交' },
  { type_id: 'tag:jiaosheng', type_name: '叫声' },
  { type_id: 'tag:chuchai', type_name: '出差' },
  { type_id: 'tag:yanshe', type_name: '颜射' },
  { type_id: 'tag:guimi', type_name: '闺蜜' },
  { type_id: 'tag:wanghuang', type_name: '网黄' },
  { type_id: 'tag:zhifu', type_name: '制服' },
  { type_id: 'tag:paoyou', type_name: '炮友' },
  { type_id: 'tag:bainen', type_name: '白嫩' },
  { type_id: 'tag:chezhen', type_name: '车震' },
  { type_id: 'tag:jianshen', type_name: '健身' },
  { type_id: 'tag:danaizi', type_name: '大奶子' },
  { type_id: 'tag:jinzhu', type_name: '金主' },
  { type_id: 'tag:tongshi', type_name: '同事' },
  { type_id: 'tag:baisi', type_name: '白丝' },
  { type_id: 'tag:dadianhua', type_name: '打电话' },
  { type_id: 'tag:dianhua', type_name: '电话' },
  { type_id: 'tag:xiaoshaofu', type_name: '小少妇' },
  { type_id: 'tag:shenzhen', type_name: '深圳' },
  { type_id: 'tag:juqing', type_name: '剧情' },
  { type_id: 'tag:nenmei', type_name: '嫩妹' },
  { type_id: 'tag:fanchabiao', type_name: '反差婊' },
  { type_id: 'tag:liangjia', type_name: '良家' },
  { type_id: 'tag:saolang', type_name: '骚浪' },
  { type_id: 'tag:linju', type_name: '邻居' },
  { type_id: 'tag:qingqu', type_name: '情趣' },
  { type_id: 'tag:wenshen', type_name: '纹身' },
  { type_id: 'tag:laobanniang', type_name: '老板娘' },
  { type_id: 'tag:hushi', type_name: '护士' },
  { type_id: 'tag:shangwei', type_name: '上位' },
  { type_id: 'tag:yinshui', type_name: '淫水' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

async function getHtml(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    return String(data || '');
  } catch (e) {
    // App 内无全局 fetch 时守卫兜底
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers: headers() });
        if (r && r.ok) return await r.text();
      }
    } catch (e2) { /* ignore */ }
    return '';
  }
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

/** 列表地址: 排序 /<段>/page/N, 标签 /<slug>/page/N, 最新即首页 */
function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat);
  let base = HOST + '/';
  if (cat && cat.indexOf('tag:') === 0) {
    base = HOST + '/' + cat.slice(4) + '/';
  } else if (cat) {
    base = HOST + '/' + cat + '/';
  }
  return page > 1 ? base + 'page/' + page : base;
}

/** 解析列表: <a class="p91-tilelink" href="https://a91porn.com/{id}"> 内含 img(og.jpg)/alt/h3 标题/p91-tlen 时长 */
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a class="p91-tilelink"[^>]*href="https?:\/\/a91porn\.com\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const body = m[2] || '';
    let pic = '';
    const im = body.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i)
      || body.match(/<source[^>]+srcset=["'](https?:\/\/[^"'\s,]+)/i);
    if (im) pic = im[1];
    if (!pic) continue;
    seen.add(id);

    let title = '';
    const hm = body.match(/<h3[^>]*>([^<]{2,200})<\/h3>/i)
      || body.match(/<img[^>]+alt=["']([^"']{2,200})["']/i);
    if (hm) title = decodeHtml(hm[1]);
    if (!title) title = '视频 ' + id;

    let remarks = '';
    const dm = body.match(/<span class="p91-tlen">([^<]{1,12})<\/span>/i);
    if (dm) remarks = t(dm[1]);

    out.push({
      vod_id: id,
      vod_name: title,
      vod_pic: pic,
      vod_remarks: remarks,
    });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<h1 class="p91-vtitle">([^<]{2,200})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m) return decodeHtml(m[1]).replace(/\s*-\s*91porn\s*$/i, '');
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1]).replace(/\s*-\s*91porn\s*$/i, '');
  return fallback || '';
}

function extractCover(html) {
  let m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (m) return absUrl(m[1]);
  return '';
}

function extractDesc(html) {
  const m = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  return m ? decodeHtml(m[1]) : '';
}

/** 详情页播放器 div 的 data-src 即 m3u8 直链 */
function extractPlay(html) {
  let m = html.match(/<div class="p91-player"[^>]*data-src=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  if (m) return m[1];
  m = html.match(/data-src=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  return m ? m[1] : '';
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
  const id = String(body.id == null ? '' : body.id);
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 24,
    total: 999 * 24,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const s = String(raw || '');
  const vid = (s.match(/a91porn\.com\/(\d+)/) || s.match(/(\d+)/) || [])[1] || s;
  if (!vid) return { list: [] };

  const pageUrl = HOST + '/' + vid;
  const html = await getHtml(pageUrl);
  if (!html) return { list: [] };

  const name = extractTitle(html, vid);
  const pic = extractCover(html);
  const content = extractDesc(html);
  const m3u8 = extractPlay(html);
  const eps = m3u8 ? ['播放$' + m3u8] : [];

  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  return {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/search?q=' + encodeURIComponent(wd);
  if (page > 1) url += '&page=' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 24,
    total: 999 * 24,
    list,
  };
}

export default function spider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}