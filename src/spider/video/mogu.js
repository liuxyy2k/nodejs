import req from '../../util/req.js';

// 蘑菇视频 https://moguds.cc —— 视频站（由用户提供的 upload-2.js 移植）
// 分类：16 个大区作顶级分类，各区细分（cate3～cate288）走筛选卡片 filters.sub
// 列表：<a href="/video/\d+/"> 卡片，封面走 dfdf.tjacq.com（实测无 Referer 也 200，无需 @ 后缀）
// 详情：#article-videos data-url + cdn_lines 组直链（首选 dfdf，备选 cloudfront）；播放直链 parse:0
// 字幕：详情预热 + 播放带 subs（与 32 个带芯猫源同一套聚合芯：迅雷/迅雷看看/SubtitleCat 三槽，带时长显示与名字+时长去重）
// 清晰度：站方每片只给一条单码率播单（实测 720p），无多档切换机制，故不设假清晰度选单
const HOST = 'https://moguds.cc';
const CDN = 'https://dfdf.tjacq.com';
const ALT_CDN = 'https://d1uy7itup9paqh.cloudfront.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const ZONES = [
  { id: "zone_featured", name: "🔥今日精选", default: "route_home_featured", subs: [{ n: "今日推荐", v: "route_home_featured" }, { n: "顶级网黄", v: "cate3" }, { n: "福利姬", v: "cate4" }, { n: "传媒精选", v: "cate6" }, { n: "JVID", v: "cate7" }, { n: "锅锅酱", v: "cate8" }] },
  { id: "zone_theme", name: "💋热门主题", default: "cate9", subs: [{ n: "巨乳大奶", v: "cate9" }, { n: "抖音风", v: "cate10" }, { n: "樱花小猫", v: "cate12" }, { n: "反差女友", v: "cate13" }, { n: "调教性奴", v: "cate15" }, { n: "ASMR", v: "cate16" }, { n: "高潮自慰", v: "cate18" }, { n: "露出野战", v: "cate20" }, { n: "SWAG", v: "cate21" }, { n: "绿帽淫妻", v: "cate23" }, { n: "群交滥交", v: "cate24" }, { n: "风骚少妇", v: "cate25" }, { n: "AI女神", v: "cate27" }, { n: "风骚母狗", v: "cate28" }, { n: "断袖男同", v: "cate29" }, { n: "原创短剧", v: "cate30" }, { n: "足交口爆", v: "cate31" }, { n: "炮桶小屋", v: "cate32" }, { n: "无套内射", v: "cate33" }, { n: "黑鬼长屌", v: "cate34" }, { n: "女同百合", v: "cate35" }, { n: "伪娘人妖", v: "cate36" }] },
  { id: "zone_creator", name: "💃网红达人", default: "cate37", subs: [{ n: "吴梦梦", v: "cate37" }, { n: "网黄", v: "cate38" }, { n: "umate原创", v: "cate39" }, { n: "Naomii", v: "cate40" }, { n: "YuiPeach", v: "cate41" }, { n: "唐伯虎", v: "cate42" }, { n: "饼干姐姐", v: "cate43" }, { n: "台北娜娜", v: "cate44" }, { n: "MASKU", v: "cate45" }, { n: "Xreind", v: "cate46" }, { n: "小桃酱", v: "cate47" }, { n: "安安小晗", v: "cate48" }, { n: "柚子猫", v: "cate49" }, { n: "王梨奈", v: "cate50" }, { n: "辛尤里", v: "cate51" }, { n: "粉色情人", v: "cate52" }, { n: "阿朱", v: "cate53" }, { n: "奶咪", v: "cate54" }, { n: "有根棒棒", v: "cate55" }, { n: "不见星空", v: "cate56" }, { n: "Kitty", v: "cate57" }, { n: "妮可", v: "cate58" }, { n: "Cos女神", v: "cate59" }, { n: "玩偶姊姊", v: "cate60" }, { n: "司雨", v: "cate61" }, { n: "谭晓彤", v: "cate62" }, { n: "刘玥", v: "cate63" }, { n: "Vivian", v: "cate64" }, { n: "多乙", v: "cate65" }, { n: "朱可儿", v: "cate66" }, { n: "周大萌", v: "cate67" }] },
  { id: "zone_media", name: "🎬传媒厂牌", default: "cate69", subs: [{ n: "麻豆传媒", v: "cate69" }, { n: "蜜桃传媒", v: "cate70" }, { n: "葫芦影业", v: "cate71" }, { n: "香蕉视频", v: "cate72" }, { n: "兔子先生", v: "cate73" }, { n: "OnlyFans", v: "cate74" }, { n: "91制片厂", v: "cate75" }, { n: "ED Mosaic", v: "cate76" }, { n: "IBiZa Media", v: "cate77" }, { n: "SA国际传媒", v: "cate78" }, { n: "乌托邦", v: "cate79" }, { n: "大象传媒", v: "cate80" }, { n: "天美传媒", v: "cate81" }, { n: "扣扣传媒", v: "cate82" }, { n: "性视界", v: "cate83" }, { n: "星空传媒", v: "cate84" }, { n: "映秀传媒", v: "cate85" }, { n: "杏吧原版", v: "cate86" }, { n: "果冻传媒", v: "cate87" }, { n: "爱神传媒", v: "cate88" }, { n: "爱豆传媒", v: "cate89" }, { n: "精东影业", v: "cate90" }, { n: "糖心Vlog", v: "cate91" }, { n: "萝莉社", v: "cate92" }] },
  { id: "zone_cos", name: "🎀福利姬社", default: "cate94", subs: [{ n: "桥本香菜", v: "cate94" }, { n: "米菲兔", v: "cate95" }, { n: "捅主任", v: "cate96" }, { n: "npxvip", v: "cate97" }, { n: "Andm", v: "cate98" }, { n: "liburin", v: "cate99" }, { n: "谭晓彤", v: "cate100" }, { n: "小水水", v: "cate101" }, { n: "小鸟酱", v: "cate102" }, { n: "HAMAR", v: "cate103" }, { n: "铃木美子", v: "cate104" }, { n: "占星猫", v: "cate105" }, { n: "芋圆呀", v: "cate106" }, { n: "小丁妹妹", v: "cate107" }, { n: "米娜学姐", v: "cate108" }, { n: "米胡桃", v: "cate109" }, { n: "萌白酱", v: "cate110" }, { n: "麻酥酥", v: "cate111" }, { n: "白桃少女", v: "cate112" }, { n: "八月未央", v: "cate113" }] },
  { id: "zone_melon", name: "🍉黑料吃瓜", default: "cate115", subs: [{ n: "网红大瓜", v: "cate115" }, { n: "校园猛料", v: "cate116" }, { n: "大奶孕妇", v: "cate117" }, { n: "独家泄密", v: "cate118" }, { n: "热门吃瓜", v: "cate119" }, { n: "潜规则", v: "cate120" }, { n: "反差泄露", v: "cate121" }, { n: "裸贷风波", v: "cate122" }, { n: "轮奸呀", v: "cate123" }, { n: "饥渴新娘", v: "cate124" }, { n: "强奸醉奸", v: "cate125" }, { n: "迷奸", v: "cate126" }] },
  { id: "zone_pornhub", name: "🌐P站精选", default: "cate128", subs: [{ n: "AnnyWalker", v: "cate128" }, { n: "MilaAzul", v: "cate129" }, { n: "Comatozze", v: "cate130" }, { n: "Honey", v: "cate131" }, { n: "Luxury", v: "cate132" }, { n: "kittyxk", v: "cate133" }, { n: "JennyKitty", v: "cate134" }, { n: "LeoLulu", v: "cate135" }, { n: "PurpleB", v: "cate136" }, { n: "MilaLioness", v: "cate137" }, { n: "Pinklov", v: "cate138" }, { n: "PornForce", v: "cate139" }, { n: "Shinaryen", v: "cate140" }, { n: "EvaElfie", v: "cate141" }, { n: "Candy", v: "cate142" }, { n: "Kenzie", v: "cate143" }, { n: "CarlaCu", v: "cate144" }, { n: "webto", v: "cate145" }, { n: "SiaSib", v: "cate146" }] },
  { id: "zone_flower", name: "🔎探花寻芳", default: "cate148", subs: [{ n: "沈先生", v: "cate148" }, { n: "赵总寻花", v: "cate149" }, { n: "小天探花", v: "cate150" }, { n: "换妻探花", v: "cate151" }, { n: "七天探花", v: "cate152" }, { n: "千人斩", v: "cate153" }, { n: "午夜尋花", v: "cate154" }, { n: "91大神", v: "cate155" }, { n: "按摩会所", v: "cate156" }, { n: "韩国嫖妓", v: "cate157" }, { n: "陈先生", v: "cate158" }, { n: "太子寻花", v: "cate159" }, { n: "翼屌寻花", v: "cate160" }, { n: "小宝寻花", v: "cate161" }, { n: "文轩探花", v: "cate162" }] },
  { id: "zone_taboo", name: "🌪️逆天乱伦", default: "cate164", subs: [{ n: "兄妹情深", v: "cate164" }, { n: "最爱岳母", v: "cate165" }, { n: "淫荡儿媳", v: "cate166" }, { n: "淫乱父女", v: "cate167" }, { n: "照顾小侄女", v: "cate168" }, { n: "师生恋情", v: "cate169" }, { n: "母子情深", v: "cate170" }, { n: "姐弟爱恋", v: "cate171" }, { n: "调教嫂子", v: "cate172" }, { n: "照顾小姨子", v: "cate173" }] },
  { id: "zone_erotic", name: "🔞精品三级", default: "cate175", subs: [{ n: "韩国三级", v: "cate175" }, { n: "香港三级", v: "cate176" }, { n: "台湾三级", v: "cate177" }, { n: "欧洲情色", v: "cate178" }, { n: "俄乌色情", v: "cate179" }, { n: "越南菲律宾", v: "cate180" }, { n: "印度情色", v: "cate181" }, { n: "日本三级", v: "cate182" }, { n: "美国色情", v: "cate183" }, { n: "东南亚情色", v: "cate184" }] },
  { id: "zone_live", name: "📡火热直播", default: "cate186", subs: [{ n: "多人淫交", v: "cate186" }, { n: "车震直播", v: "cate187" }, { n: "日韩主播", v: "cate188" }, { n: "户外直播", v: "cate189" }, { n: "抖音网红", v: "cate190" }, { n: "主播勾引", v: "cate191" }, { n: "快手网红", v: "cate192" }, { n: "对着你", v: "cate193" }, { n: "AVOVE", v: "cate194" }, { n: "MISSWAEM", v: "cate195" }, { n: "妖骚蛇姬", v: "cate196" }, { n: "大啵啵", v: "cate197" }, { n: "虎牙辣妹", v: "cate198" }] },
  { id: "zone_uniform", name: "👗制服诱惑", default: "cate200", subs: [{ n: "古装诱惑", v: "cate200" }, { n: "萝莉塔", v: "cate201" }, { n: "空姐诱惑", v: "cate202" }, { n: "丝袜诱惑", v: "cate203" }, { n: "职场OL", v: "cate204" }, { n: "清涩校服", v: "cate205" }, { n: "三点泳装", v: "cate206" }, { n: "JK短裙", v: "cate207" }, { n: "女仆装", v: "cate208" }, { n: "护士打针", v: "cate209" }, { n: "国风旗袍", v: "cate210" }, { n: "体操运动", v: "cate211" }, { n: "其他制服", v: "cate212" }] },
  { id: "zone_asia", name: "🌸日韩精选", default: "cate214", subs: [{ n: "骑兵精选", v: "cate214" }, { n: "高清优质", v: "cate215" }, { n: "FC2高清", v: "cate216" }, { n: "VR视觉", v: "cate217" }, { n: "人妻巨乳", v: "cate218" }, { n: "少女制服", v: "cate219" }, { n: "药物迷奸", v: "cate220" }, { n: "强暴系列", v: "cate221" }, { n: "轮奸系列", v: "cate222" }, { n: "筱田佑", v: "cate223" }, { n: "森澤佳奈", v: "cate224" }, { n: "三上悠亜", v: "cate225" }, { n: "AkihoYoshizawa", v: "cate226" }, { n: "神宮寺奈緒", v: "cate227" }, { n: "藤森里穗", v: "cate228" }, { n: "松本一香", v: "cate229" }, { n: "乙爱丽丝", v: "cate230" }, { n: "沙月芽衣", v: "cate231" }, { n: "姬咲華", v: "cate232" }, { n: "AliceOtsu", v: "cate233" }, { n: "佐山愛", v: "cate234" }, { n: "水果解說", v: "cate235" }] },
  { id: "zone_west", name: "🗽欧美洋马", default: "cate237", subs: [{ n: "推荐观看", v: "cate237" }, { n: "颜值少女", v: "cate238" }, { n: "网红洋马", v: "cate239" }, { n: "CandyLove", v: "cate240" }, { n: "丝袜制服", v: "cate241" }, { n: "欧美剧情", v: "cate242" }, { n: "AngelX", v: "cate243" }, { n: "商场性交", v: "cate244" }, { n: "情色按摩", v: "cate245" }, { n: "捷克搭讪", v: "cate246" }, { n: "肤若凝脂", v: "cate247" }, { n: "SweetieFox", v: "cate248" }, { n: "Morgpie", v: "cate249" }, { n: "DianRider", v: "cate250" }, { n: "BadCuteGirl", v: "cate251" }, { n: "Ailish", v: "cate252" }, { n: "SamanthaFlair", v: "cate253" }, { n: "滥交群交", v: "cate254" }, { n: "巨乳少女", v: "cate255" }, { n: "黑人大屌", v: "cate256" }] },
  { id: "zone_variety", name: "🎭综艺娱乐", default: "cate258", subs: [{ n: "深夜保健室", v: "cate258" }, { n: "王竹子教学", v: "cate259" }, { n: "中指通一下", v: "cate260" }, { n: "Misa米砂", v: "cate261" }, { n: "小哥哥艾理", v: "cate262" }, { n: "Dr.She", v: "cate263" }, { n: "1G老湿", v: "cate264" }, { n: "两性知识", v: "cate265" }, { n: "麻豆综艺", v: "cate266" }, { n: "户外搭讪", v: "cate267" }, { n: "性愛大秀", v: "cate268" }, { n: "女优训练营", v: "cate269" }, { n: "情趣k歌房", v: "cate270" }, { n: "小鹏奇啪行", v: "cate271" }, { n: "性爱自修室", v: "cate272" }, { n: "女神体育祭", v: "cate273" }, { n: "屁孩日记", v: "cate274" }, { n: "薇傲的性趣", v: "cate275" }, { n: "一三蜜桃说", v: "cate276" }, { n: "Carrie雨千", v: "cate277" }] },
  { id: "zone_cinema", name: "📽️影视影院", default: "cate279", subs: [{ n: "喜剧片", v: "cate279" }, { n: "古装片", v: "cate280" }, { n: "武侠片", v: "cate281" }, { n: "枪战片", v: "cate282" }, { n: "灾难片", v: "cate283" }, { n: "冒险片", v: "cate284" }, { n: "犯罪片", v: "cate285" }, { n: "科幻片", v: "cate286" }, { n: "动作片", v: "cate287" }, { n: "恐怖片", v: "cate288" }] }
];
function filtersFor(zone) {
  if (!zone || !zone.subs || zone.subs.length <= 1) return [];
  return [{ key: 'sub', name: '细分分类', value: zone.subs.map((s) => ({ n: s.n, v: s.v })) }];
}

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

function cleanLabel(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\r\n\t]+/g, ' ').replace(/[$#]/g, '').trim();
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

// 站方 data-original 常写成 https:/dfdf...（单斜杠）且图与播单在 dfdf 与 cloudfront 两线内容逐字节相同；
// 统一修成标准 https:// 并走 cloudfront 线，避开 dfdf 单域名故障面
function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
  if (s.startsWith('dfdf.tjacq.com/')) s = 'https://' + s;
  s = s.replace('dfdf.tjacq.com', 'd1uy7itup9paqh.cloudfront.net');
  return s;
}

function pickPlayBase(bases) {
  const list = Array.isArray(bases) ? bases : [];
  const cf = list.find((b) => b.includes('cloudfront'));
  if (cf) return cf;
  return list[0] || ALT_CDN;
}

async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 字幕聚合芯的取数原语：统一回 {status, body}；设备 axios 走配置调用
// （responseType text 保证 JSON 原文不被提前解析），本机桩走 req.get。
async function reqRaw(url, headers, timeoutMs) {
  try {
    let r;
    if (typeof req === 'function') {
      r = await req({ method: 'GET', url, headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5 });
    } else {
      r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
    }
    const body = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    return { status: r.status || 0, body, headers: r.headers || {}, err: null };
  } catch (e) {
    return { status: 0, body: '', headers: {}, err: e };
  }
}

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
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

function extractPic(inner) {
  for (const attr of ['data-original', 'data-src', 'src']) {
    const m = inner.match(new RegExp(attr + "=['\"]([^'\"]+)['\"]", 'i'));
    if (m) {
      const cand = m[1].trim();
      if (cand && !['loading.jpg', 'loading.png', 'placeholder', 'default'].some((b) => cand.toLowerCase().includes(b))) {
        if (cand.startsWith('/')) return ALT_CDN + cand;
        return cand;
      }
    }
  }
  return '';
}

function parseCards(html, host) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href=["'](\/video\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const vUrl = m[1].trim();
    const inner = m[2];
    if (seen.has(vUrl)) continue;
    const pic = extractPic(inner);
    let title = '';
    const tM = inner.match(/(?:title=["']([^"']+)["']|alt=["']([^"']+)["']|<h\d[^>]*>([\s\S]*?)<\/h\d>)/i);
    if (tM) title = cleanLabel(tM[1] || tM[2] || tM[3] || '');
    if (!title) {
      const lines = cleanLabel(inner).split(/\s+/).filter((x) => x.length > 3);
      if (lines.length) title = lines[0];
    }
    const durM = inner.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (vUrl && (pic || title)) {
      seen.add(vUrl);
      items.push({
        vod_id: vUrl,
        vod_name: title || '蘑菇精彩视频',
        vod_pic: pic ? normUrl(pic.startsWith('http') ? pic : absUrl(pic, host)) : '',
        vod_remarks: durM ? durM[1] : '',
      });
    }
  }
  return items;
}

function parseCdnLines(html) {
  const bases = [];
  const m = String(html || '').match(/cdn_lines\s*=\s*'([^']+)'/);
  if (m) {
    try {
      const arr = JSON.parse(m[1].replace(/\\\//g, '/'));
      for (const it of arr || []) {
        const b = String((it && it.cdnLine) || '').replace(/\/+$/, '').replace(/^(https?:)\/([^\/])/, '$1//$2');
        if (b.startsWith('http') && !bases.includes(b)) bases.push(b);
      }
    } catch (e) { /* ignore */ }
  }
  if (!bases.includes(CDN)) bases.push(CDN);
  if (!bases.includes(ALT_CDN)) bases.push(ALT_CDN);
  return bases;
}

function cleanStreamUrl(raw) {
  if (!raw) return '';
  const clean = String(raw).replace(/\\u002F/g, '/').replace(/\\\//g, '/').trim();
  let m = clean.match(/https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*/i);
  if (m) return m[0];
  m = clean.match(/https?:\/\/[^\s"'$<>]+\.mp4[^\s"'$<>]*/i);
  if (m) return m[0];
  return clean;
}

function extractPlayerVarUrl(html, varName) {
  const re = new RegExp('var\\s+' + varName + '\\s*=\\s*(\\{[\\s\\S]*?\\});');
  const m = String(html || '').match(re);
  if (!m) return '';
  try {
    const obj = JSON.parse(m[1]);
    if (obj && obj.url) return cleanStreamUrl(String(obj.url));
  } catch (e) { /* ignore */ }
  const um = m[1].match(/["']url["']\s*:\s*["']([^"']*)["']/);
  if (um) return cleanStreamUrl(um[1]);
  return '';
}

function extractPlayStream(html) {
  let m = html.match(/id=["']article-videos["'][^>]*data-url=["']([^"']+)["']/i)
    || html.match(/data-url=["']([^"']+)["'][^>]*id=["']article-videos["']/i);
  if (m) {
    let cand = m[1].trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    if (cand.startsWith('//')) cand = 'https:' + cand;
    else if (cand.startsWith('/')) cand = ALT_CDN + cand;
    else if (!cand.startsWith('http')) cand = CDN + '/' + cand;
    return { url: cand, viaDataUrl: true };
  }
  m = html.match(/(?:var\s+raw\s*=\s*|video_url\s*:\s*|url\s*:\s*)["'](https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*)["']/i);
  if (m) return { url: m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/'), viaDataUrl: false };
  m = html.match(/https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*/i);
  if (m) return { url: m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/'), viaDataUrl: false };
  m = html.match(/https?:\/\/[^\s"'$<>]+\.mp4[^\s"'$<>]*/i);
  if (m) return { url: m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/'), viaDataUrl: false };
  return { url: '', viaDataUrl: false };
}

async function home() {
  const classes = ZONES.map((z) => ({ type_id: z.id, type_name: z.name }));
  const filters = {};
  for (const z of ZONES) {
    const f = filtersFor(z);
    if (f.length) filters[z.id] = f;
  }
  let list = [];
  try {
    list = parseCards(await getHtml('/'), HOST).slice(0, 20);
  } catch (e) { list = []; }
  return { class: classes, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '').replace(/\//g, '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  const zone = ZONES.find((x) => x.id === zoneId);
  let target = String(extend.sub || '').trim();
  if (!target) target = zone ? zone.default : zoneId;
  if (!target) target = zoneId;
  let path = '';
  if (target === 'route_home_featured') {
    path = page === 1 ? '/' : ('/page/' + page + '/');
  } else {
    path = page === 1 ? ('/category/' + target + '/') : ('/category/' + target + '/' + page + '/');
  }
  const html = await getHtml(path);
  const list = parseCards(html, HOST);
  let next = false;
  if (target === 'route_home_featured') next = html.includes('/page/' + (page + 1) + '/');
  else next = html.includes('/category/' + target + '/' + (page + 1) + '/');
  if (!next && list.length > 0) {
    const nums = [...html.matchAll(/\/category\/[a-z0-9]+\/(\d+)\//gi)].map((x) => parseInt(x[1], 10));
    if (nums.length && Math.max(...nums) > page) next = true;
  }
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!kw) return { list: [] };
  const path = page === 1 ? ('/search/' + encodeURIComponent(kw) + '/') : ('/search/' + encodeURIComponent(kw) + '/' + page + '/');
  const html = await getHtml(path);
  return { page, list: parseCards(html, HOST) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  subWarm(durl); // 字幕预热：与下方取播单并行跑，点播时 play 直接命中缓存/在途
  const html = await getHtml(rawId);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '高清视频';
  if (tM) mainTitle = tM[1].trim().replace(/\s*[-_]\s*蘑菇视频\s*$/i, '').trim() || '高清视频';
  if (mainTitle) subCacheName(durl, mainTitle); // 字幕搜索键优先用真片名
  const stream = extractPlayStream(html);
  let playUrl = '';
  if (stream.viaDataUrl) {
    playUrl = stream.url;
  } else if (stream.url) {
    playUrl = stream.url;
  }
  if (!playUrl) {
    const v = extractPlayerVarUrl(html, 'player_aaaa') || extractPlayerVarUrl(html, 'player_data');
    if (v) playUrl = v;
  }
  if (!playUrl) {
    const dm = html.match(/id=["']article-videos["'][^>]*data-url=["']([^"']+)["']/i)
      || html.match(/data-url=["']([^"']+)["'][^>]*id=["']article-videos["']/i);
    if (dm) {
      const bases = parseCdnLines(html);
      const pth = dm[1].trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      playUrl = pickPlayBase(bases).replace(/\/+$/, '') + (pth.startsWith('/') ? pth : '/' + pth);
    }
  }
  let posterPic = '';
  const dfdf = String(html || '').match(/dfdf\.tjacq\.com\/image\/[^\s"']+/g);
  if (dfdf && dfdf.length) posterPic = normUrl('https://' + dfdf[0]);
  if (!posterPic) {
    const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogM) posterPic = normUrl(ogM[1].trim());
  }
  if (!posterPic) {
    const selfCard = parseCards(html, HOST).find((c) => c.id === rawId);
    if (selfCard && selfCard.vod_pic) posterPic = selfCard.vod_pic;
  }
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: 'HD超清',
      vod_content: '蘑菇视频',
      vod_play_from: '蘑菇视频',
      vod_play_url: playUrl ? ('正片$' + durl + '@@' + playUrl) : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  // 新格式：详情页地址@@播单地址（供字幕搜索找回片名）；旧格式（纯播单）照常播、无字幕
  let durl = '';
  let target = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  if (!target) return { parse: 0, url: '' };
  const subsP = durl ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs; // 无字幕命中时不带此键，返回与接入前逐字段一致
  return result;
}

export default {
    meta: { key: 'py_mogu', name: '🍭蘑菇视频', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
}