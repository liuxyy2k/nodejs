const CORE_TAGS = [
    "美剧", "韩剧", "日剧", "台剧", "港剧", "港台剧", "国产剧", "大陆剧", "内地剧", "泰剧", "英剧",
    "美剧版", "英剧版", "日剧版", "韩剧版", "台剧版", "港剧版", "泰剧版",
    "影后", "影帝", "国剧", "微短剧", "短剧", "电影", "剧集", "综艺", "犯罪", "动漫", "动画",
    "纪录片", "短片", "连续剧", "系列剧", "网络剧", "电视剧"
];

const OTHER_TAGS = [
    "影片", "片子", "片花", "片段", "预告", "预告片", "花絮", "幕后", "访谈", "特别篇", "番外篇",
    "OVA", "OAD", "SP", "TV版", "剧场版", "电影版", "影版", "剧版","国语版","普通话版","粤语版",
    "闽南语版", "客家语版", "吴语版", "川语版", "湘语版", "赣语版", "粤语配音版", "国语配音版",
    "普通话配音版", "方言版", "原版配音", "原音版", "台语版", "粤语中字版", "国语中字版", "普通话中字版",
    "粤语原声版", "国语原声版", "普通话原声版", "粤语内嵌字幕版", "国语内嵌字幕版", "普通话内嵌字幕版",
    "动画版", "真人版", "改编版",
    "重制版", "修复版", "加长版", "未删减版", "完整版", "导演剪辑版", "终极版", "特别版", "限定版",
    "收藏版", "豪华版", "典藏版", "高清版", "超清版", "标清版", "HD版", "UHD版", "4K版", "蓝光版",
    "DVD版", "BD版", "WEB版", "TVrip", "BDrip", "DVDrip", "HDrip", "WEB-DL", "HDTV", "DVDRip",
    "BRRip", "HDRip", "BluRay", "TS", "TC", "CAM", "抢先版", "枪版", "偷拍版", "泄露版", "抢先看",
    "正片", "正片片段", "正片精华", "花絮集锦", "幕后花絮", "制作特辑", "访谈录", "首映礼", "红毯秀",
    "路演", "发布会", "预告片合集", "预告片花絮", "片花预告", "精彩片段", "精彩集锦", "精选片段",
    "高能片段", "高光时刻", "剪辑版", "混剪", "MV", "主题曲", "插曲", "片尾曲", "配乐", "原声",
    "OST", "原声带", "原声大碟", "音乐集", "音乐会", "演唱", "Live", "Live版", "现场版",
    "现场录制", "舞台版", "舞台剧", "话剧", "歌剧", "舞剧", "戏曲", "京剧", "越剧", "粤剧", "评剧",
    "黄梅戏", "二人转", "相声", "小品", "综艺秀", "真人秀", "脱口秀", "访谈节目", "纪录片系列",
    "专题片", "科教片", "动画片", "动漫片", "动画短片", "动画电影", "动画系列", "动画剧集",
    "动画连续剧", "动画OVA", "动画OAD", "动画SP", "动画特典", "动画合集", "动画精选", "电影合集",
    "影片合集", "系列合集", "合集版", "套装版", "套装合集", "全集", "全系列", "全季", "第一季",
    "第二季", "第三季", "第四季", "第五季", "第六季", "第七季", "第八季", "第九季", "第十季",
    "更新中", "完结", "完结篇", "完结季", "最终季", "最终章", "终章", "终篇", "大结局", "大結局",
    "特别篇完结", "番外完结", "OVA完结", "OAD完结", "SP完结", "全剧终", "完结撒花", "完结纪念",
    "完结特辑", "完结访谈", "完结花絮", "完结合集", "完结篇合集", "完结纪念合集", "完结特辑合集",
    "完结访谈合集", "完结花絮合集", "完结纪念特辑", "完结纪念访谈", "完结纪念花絮",
    "完结纪念合集特辑", "完结纪念合集访谈", "完结纪念合集花絮", "完结纪念特辑访谈",
    "完结纪念特辑花絮", "完结纪念访谈花絮", "完结纪念合集特辑访谈花絮", "BD", "BDRIP",
    "WEB-DL", "HDRip", "DVDRip", "BDRip", "BRRip", "Rip", "BluRay", "IMAX", "CAM", "HD", "HDR",
    "UHD", "4K", "1080p", "720p", "2160p", "480p", "120fps", "60fps", "x264", "x265", "H264",
    "HEVC", "AAC", "dts", "ddp", "truehd", "10bit", "8bit", "5.1", "7.1", "国语", "粤语",
    "英语", "日语", "韩语", "泰语", "法语", "德语", "西班牙语", "俄语", "葡萄牙语", "意大利语",
    "臻彩", "中字", "简中", "繁中", "简繁中字", "中英双字", "内嵌", "内封", "杜比全景声", "杜比音效",
    "无水印", "完整版", "原声版", "解说版", "预告片", "未删减版", "加长版", "蓝光", "抢先版", "TC版",
    "抢先", "TC", "两季全", "全季", "全集", "DV", "压制", "HQ", "帧", "电影版", "豆瓣", "更新",
    "更新到", "推荐", "动作", "冒险", "爱情", "科幻", "悬疑", "惊悚", "恐怖", "喜剧", "悲剧",
    "剧情", "奇幻", "犯罪", "战争", "历史", "传记", "音乐", "歌舞", "家庭", "儿童", "体育", "灾难",
    "伦理", "短片", "微电影", "高清", "超清", "标清", "抢鲜看", "首播", "独播", "热播", "连载中",
    "最新", "经典", "热门", "获奖", "口碑", "好评", "高分", "豆瓣高分", "IMDb高分", "未分级",
    "限制级", "导演剪辑", "加长", "特别加长", "终极剪辑", "收藏", "豪华", "纪念", "限定", "重映",
    "修复", "数码修复", "重制", "蓝光修复", "重制高清", "高清重制", "重编", "重剪", "配音", "译制",
    "原声", "双语", "多语", "多声道", "环绕声", "全景声", "3D", "VR", "全景", "360度", "8K", "原画",
    "无损", "有损", "压缩", "未压缩", "高码率", "低码率", "重编码", "多字幕", "多音轨", "双音轨",
    "多版本", "合集", "套装", "系列", "完结版", "最终季", "最终章", "终章", "大结局", "特别篇",
    "番外篇", "OVA", "OAD", "SP", "剧场版", "电影版", "影版", "剧版", "动画版", "真人版", "改编版",
    "原创", "衍生", "番外", "续集", "前传", "后传", "重启", "翻拍", "重拍", "致敬", "纪念", "献礼",
    "贺岁", "暑期档", "国庆档", "贺岁档", "春节档", "情人节档", "中秋档", "档期", "上映", "定档",
    "首映", "公映", "上映时间", "上映日期", "票房", "票房冠军", "票房榜", "口碑榜", "评分榜",
    "排行榜", "榜单", "榜单第一", "热门榜", "热搜", "热议", "话题", "热议话题", "热门话题",
'讨论度', '关注度', '热度', '热度榜', '热门推荐', '精选', '力荐', '强烈推荐', '必看',
    '不可错过', '经典之作', '神作', '佳作', '高分佳作', '高分神作', '烂片', '差评', '低分',
    '口碑爆棚', '口碑扑街', '口碑两极', '口碑分化', '争议', '热议不断', '备受关注', '万众期待',
    '期待已久', '万众瞩目', '年度最佳', '年度最差', '年度之作', '年度黑马', '年度惊喜', '年度失望',
    '压轴之作', '收官之作', '收官', '收官季', '收官战', '大结局前篇', '大结局后篇', '最终回',
    '最终话', '最终章前篇', '最终章后篇'
];

const ALL_TAGS = [...CORE_TAGS, ...OTHER_TAGS];
const ALL_TAGS_REGEX = new RegExp(ALL_TAGS.join('|'), 'ig');
const CORE_TAGS_REGEX = new RegExp(CORE_TAGS.join('|'), 'ig');

export function extractTitle(src) {
    if (!src || !src.trim()) return "";

    let result = src.trim();

    // Pre-cleanup
    result = result.replace(/丨/g, '');
    result = result.replace(/-/g, ' ');
    result = result.replace(CORE_TAGS_REGEX, '');
    result = result.replace(/\s+/g, ' ').trim();

    // Match movie series like "碟中谍8：..."
    let movieSeriesMatch = result.match(/^[\u4e00-\u9fa5]+\d+(?=：|\s|$)/);
    if (movieSeriesMatch) return movieSeriesMatch[0];

    // Match title before year like "唐探1900 (2025)"
    let prefixTitleMatch = result.match(/^[\u4e00-\u9fa5]+[\u4e00-\u9fa50-9]+\s*(?=\(\d{4}\))/);
    if (prefixTitleMatch) return prefixTitleMatch[0];

    // Preferentially extract core title without symbols
    let coreTitleMatch = result.match(/^[\u4e00-\u9fa5]+[\u4e00-\u9fa5 ,.，。、]+\s*(?=\(|【|\s+\d{4})/);
    let tempCoreTitle = coreTitleMatch ? coreTitleMatch[0].trim() : "";

    // Extract content from book title marks or brackets
    let hasExtracted = false;
    let bookMatch = result.match(/《(.+?)》/);
    if (bookMatch) {
        result = bookMatch[1];
        hasExtracted = true;
    } else {
        const bracketRegex = new RegExp(`【((?!${CORE_TAGS.join('|')})[\u4e00-\u9fa5]{2,}[^/]+?)】`, 'i');
        let bracketMatch = result.match(bracketRegex);
        if (bracketMatch) {
            result = bracketMatch[1];
            hasExtracted = true;
        }
    }

    if (!hasExtracted && tempCoreTitle) result = tempCoreTitle;

    // Cleanup rules
    const replaceRules = [
        [/.*-/g, ''],
        [/\b\d{4}\b/g, ''],
        [/(?<!^)\[.*?\]|\{.*?\}|（.*?）|「.*?」/g, ' '],
        [/\b\d+(\.\d+)?[GMK]B?\b/gi, ''],
        [ALL_TAGS_REGEX, ''],
        [/豆瓣\d+(\.\d+)?/g, ''],
        [/\b\d+(?=fps|帧)/g, ''],
        [/\b[a-zA-Z]\b/g, ''],
        [/(?<![\u4e00-\u9fa5])\b\d+\b(?![\u4e00-\u9fa5])/g, ''],
        [/[^a-zA-Z0-9\u4e00-\u9fa5 ]/g, ''],
        [/\s+/g, ' ']
    ];

    for (const rule of replaceRules) {
        result = result.replace(rule[0], rule[1]);
    }

    result = result.trim(); // Trim after all major replacements

    if (result.includes(' ')) {
        result = result.substring(0, result.indexOf(' '));
    }

    if (!hasExtracted && tempCoreTitle) {
        result = result.replace(/\s/g, '');
    }

    // Handle cases where the title is at the end
    let lastChineseMatch = src.match(/([\u4e00-\u9fa5]{2,})\s*$/);
    if (lastChineseMatch) {
        const lastPart = lastChineseMatch[1];
        if (result.length < 2 || /\d+集/.test(result)) {
            result = lastPart;
        }
    }

    // Extra handling if result is empty
    if (!result) {
        let bracketContentMatch = src.match(/\[(.*?)\]/);
        if (bracketContentMatch) {
            result = bracketContentMatch[1].trim();
            result = result.replace(ALL_TAGS_REGEX, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
        }
    }

    return result.trim(); // Final trim to ensure no trailing spaces
}

/**
 * @function findSeasonNumber
 * @description Extracts the season number from a string.
 * @param {string} name The string to process.
 * @returns {string} The season number, or an empty string if not found.
 */
export function findSeasonNumber(name) {
    if (!name) return '';

    // 匹配 S01, S1, Season 1, Season01 (with improved boundary check)
    const match = name.match(/(?:^|[^a-zA-Z0-9])(S|Season)\s*(\d+)/i);
    if (match && (match[1].toLowerCase() === 's' || match[1].toLowerCase() === 'season')) {
        return match[2].padStart(2, '0');
    }

    // 匹配 第X季, 第一季
    const cnMatch = name.match(/第\s*([一二三四五六七八九十百千万亿\d]+)\s*季/);
    if (cnMatch) {
        return replaceNumbersToArabic(cnMatch[1]).padStart(2, '0');
    }

    return '';
}


// --- AutoDanMuEpisodeUtil Translation ---

const CN_NUMBERS = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
};
const CN_UNITS = {
    '十': 10, '百': 100, '千': 1000, '万': 10000, '亿': 100000000
};

/**
 * Converts a Chinese numeral string to an Arabic number.
 * @param {string} chineseNumber The Chinese numeral string.
 * @returns {number} The converted Arabic number, or -1 if invalid.
 */
function cnToArabic(chineseNumber) {
    if (!chineseNumber) return -1;

    let result = 0;
    let section = 0;
    let number = 0;
    let secUnit = false;

    for (let i = 0; i < chineseNumber.length; i++) {
        const char = chineseNumber[i];
        if (CN_NUMBERS.hasOwnProperty(char)) {
            number = CN_NUMBERS[char];
        } else if (CN_UNITS.hasOwnProperty(char)) {
            const unit = CN_UNITS[char];
            if (unit === 10) {
                if (number === 0) number = 1;
                section += number * unit;
                number = 0;
            } else if (unit === 10000 || unit === 100000000) {
                section += number;
                result += section * unit;
                section = 0;
                number = 0;
                secUnit = true;
            } else {
                section += (number || 1) * unit;
                number = 0;
            }
        } else {
            return -1; // Invalid character
        }
    }

    if (!secUnit) {
        result += section;
    }
    result += number;

    // Special case for 十 at the beginning, e.g., "十", "十一"
    if (chineseNumber.startsWith('十') && result < 20) {
        result = 10 + (result % 10);
    }

    return result;
}

/**
 * Replaces Chinese and leading-zero Arabic numerals in a string with standard Arabic numbers.
 * @param {string} text The text to process.
 * @returns {string} The processed text.
 */
function replaceNumbersToArabic(text) {
    if (!text) return text;

    return text.replace(/([零一二三四五六七八九十百千万亿]+)|(\d+)/g, (match, p1, p2) => {
        if (p1) { // Chinese number
            const val = cnToArabic(p1);
            return val !== -1 ? String(val) : match;
        } else if (p2) { // Arabic number
            return String(parseInt(p2, 10)); // Removes leading zeros
        }
        return match;
    });
}

/**
 * Pre-processes a filename to remove interfering information.
 * @param {string} name The filename to process.
 * @returns {string} The processed name.
 */
function preprocessName(name) {
    let result = name;
    // Keep 上/中/下
    result = result.replace(/[（()[\]【】{}]\s*([上中下])\s*[）()[\]【】{}]/g, '$1');
    // Remove other brackets
    result = result.replace(/(\[|\{|\（|【).*?(\]|\}|）|】)/g, ' ');
    // Remove FPS
    result = result.replace(/\d+\s*(fps|帧|frames?|hz|赫兹)/gi, ' ');
    // Remove resolution
    result = result.replace(/\b(\d+(p|k|i)|4k|8k|uhd|hd|fhd|qhd|2160p|1440p|1080p|720p|480p|360p)\b/gi, ' ');
    // Remove year
    result = result.replace(/\b(19|20)\d{2}\b/g, ' ');
    // Remove audio channels
    result = result.replace(/\b(?:dts|ddp|aac|ac3|eac3|truehd|atmos)\d+(?:\.\d+)?\b|\b\d+\.\d+\b/gi, ' ');
    // Remove bit depth
    result = result.replace(/\b(8bit|10bit|12bit)\b/gi, ' ');
    // Remove HDR/DV
    result = result.replace(/\b(hdr|hdr10|hdr10\+|dolby vision|dv|hlg)\b/gi, ' ');
    // Remove codec
    result = result.replace(/\b(x264|x265|h\.264|h\.265|h264|h265|hevc|mpeg4|av1|vp9)\b/gi, ' ');
    // Remove source
    result = result.replace(/\b(web-dl|bluray|bdrip|hdrip|dvdrip|brrip|hdtv|dvdr|cam|ts|tc|r5|scr)\b/gi, ' ');
    // Remove quality descriptions
    result = result.replace(/\b(hq|sd|hd|fhd|uhd|imax|superbit|remux|extended|uncut|directors cut|dc|special edition|se)\b/gi, ' ');
    // Remove Chinese interference words
    result = result.replace(/\b(高码|高码率|高码版|超清|高清|标清|无水印|完整版|未删减|加长版|导演剪辑版|特效字幕|内嵌字幕|双语字幕|中文字幕|英文字幕|繁体字幕|简体字幕|多音轨|杜比音效|全景声|hdr)\b/gi, ' ');
    // Replace separators with space
    result = result.replace(/[\-\_.,()]+/g, ' ');
    return result.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts a pure number from the main part of a filename.
 * @param {string} name The filename.
 * @returns {string} The extracted number or "-1".
 */
function extractPureNumberFromMain(name) {
    const stripped = name.replace(/(\[|\{|\（|【).*?(\]|\}|）|】)/g, ' ');
    if (/s\d+e\d+/i.test(stripped)) {
        return "-1";
    }

    let match = stripped.match(/[\u4e00-\u9fa5\-\_\.\s]+(0*\d{1,8})(?:[\-\_\.\s]|$)/);
    if (match) {
        const numStr = match[1];
        const numVal = parseInt(numStr, 10);
        if (numVal > 0 && !(numVal >= 1900 && numVal <= 2100)) {
            return replaceNumbersToArabic(numStr);
        }
    }

    match = stripped.trim().match(/^0*\d{1,8}$/);
    if (match) {
        const numStr = match[0];
        const numVal = parseInt(numStr, 10);
        if (numVal > 0 && !(numVal >= 1900 && numVal <= 2100)) {
            return replaceNumbersToArabic(numStr);
        }
    }

    return "-1";
}

/**
 * Matches standard episode formats (e.g., "第X集", "E01").
 * @param {string} name The filename.
 * @returns {string} The episode number or "-1".
 */
function matchStandardFormats(name) {
    const periodOrSeason = "期|季";
    const part = "上中下";
    const episodeSuffixes = "集話话";

    // Pattern 1: 第X期/季
    let regex = new RegExp(`(第?)(0*(\d{1,8}|[零一二三四五六七八九十百千万亿]+))((?:${periodOrSeason})[${part}]?[（(]?[${part}]?[)）]?)`);
    let match = name.match(regex);
    if (match) {
        const prefix = match[1];
        let numberPart = match[2];
        let suffix = match[4].replace(/[（()）]/g, '');
        numberPart = replaceNumbersToArabic(numberPart);
        return prefix + numberPart + suffix;
    }

    // Pattern 2: SxxEyy or Eyy
    const sxxeyyMatches = Array.from(name.matchAll(/(?:s\d+.*?e|e)(\d{1,8})(?!\d)/gi));
    if (sxxeyyMatches.length > 0) {
        return replaceNumbersToArabic(sxxeyyMatches[sxxeyyMatches.length - 1][1]);
    }

    // Pattern 3: 第X集 (Chinese numbers)
    regex = new RegExp(`第([零一二三四五六七八九十百千万亿]+)[${episodeSuffixes}]`);
    match = name.match(regex);
    if (match) {
        const val = cnToArabic(match[1]);
        return val > 0 ? String(val) : "-1";
    }

    // Pattern 4: 第X集 (Arabic numbers)
    regex = new RegExp(`第(\d{1,8})[${episodeSuffixes}]`);
    match = name.match(regex);
    if (match) {
        return replaceNumbersToArabic(match[1]);
    }

    // Pattern 5: EpX
    match = name.match(/ep(\d{1,8})/i);
    if (match) {
        return replaceNumbersToArabic(match[1]);
    }

    // Pattern 6: X集
    regex = new RegExp(`(\d{1,8})[${episodeSuffixes}]`);
    match = name.match(regex);
    if (match) {
        return replaceNumbersToArabic(match[1]);
    }

    return "-1";
}

/**
 * Fallback to match a pure number, excluding years.
 * @param {string} name The filename.
 * @returns {string} The episode number or "-1".
 */
function matchPureNumber(name) {
    // 使用更兼容的 Unicode 范围代替 \p{L}
    const letterRange = 'a-zA-Z\u00C0-\u017F'; // 覆盖基本的拉丁字母和扩展
    const regex = new RegExp(`(?<![${letterRange}\d])0*(\\d{1,8})(?![${letterRange}\d])`, 'gu');
    const matches = name.match(regex);
    if (matches) {
        for (const match of matches) {
            const num = parseInt(match, 10);
            if (!(num >= 1900 && num <= 2100)) {
                return replaceNumbersToArabic(match);
            }
        }
    }
    return "-1";
}

/**
 * Finds the episode number from a filename.
 * @param {string} filename The full filename.
 * @returns {string} The found episode number or "-1".
 */
export function findEpisodeNumber(filename) {
    if (!filename) return "-1";

    let name = filename;
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex > 0) {
        name = name.substring(0, dotIndex);
    }

    // 1. Try to match standard, specific formats on a preprocessed name first
    const processedName = preprocessName(name);
    let episode = matchStandardFormats(processedName);
    if (episode !== "-1") return episode;

    // 2. If not found, try to extract a number from the original name (less cleaning)
    let mainNumber = extractPureNumberFromMain(name);
    if (mainNumber !== "-1") {
        return mainNumber;
    }

    // 3. As a last resort, find any pure number in the processed name
    return matchPureNumber(processedName);
}