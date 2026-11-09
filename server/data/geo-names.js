// Native display names for the geo cascade. Countries are keyed by ISO 3166-1
// alpha-2; provinces and cities are keyed by lowercase English name (stable
// across dataset versions). Anything missing falls back to English, which is
// what the product spec requires for non en/km/zh languages anyway.

const COUNTRIES_ZH = {
  AF: '阿富汗', AL: '阿尔巴尼亚', DZ: '阿尔及利亚', AD: '安道尔', AO: '安哥拉',
  AG: '安提瓜和巴布达', AR: '阿根廷', AM: '亚美尼亚', AU: '澳大利亚', AT: '奥地利',
  AZ: '阿塞拜疆', BS: '巴哈马', BH: '巴林', BD: '孟加拉国', BB: '巴巴多斯',
  BY: '白俄罗斯', BE: '比利时', BZ: '伯利兹', BJ: '贝宁', BT: '不丹',
  BO: '玻利维亚', BA: '波黑', BW: '博茨瓦纳', BR: '巴西', BN: '文莱',
  BG: '保加利亚', BF: '布基纳法索', BI: '布隆迪', CV: '佛得角', KH: '柬埔寨',
  CM: '喀麦隆', CA: '加拿大', CF: '中非共和国', TD: '乍得', CL: '智利',
  CN: '中国', CO: '哥伦比亚', KM: '科摩罗', CG: '刚果共和国', CD: '刚果民主共和国',
  CR: '哥斯达黎加', CI: '科特迪瓦', HR: '克罗地亚', CU: '古巴', CY: '塞浦路斯',
  CZ: '捷克', DK: '丹麦', DJ: '吉布提', DM: '多米尼克', DO: '多米尼加共和国',
  EC: '厄瓜多尔', EG: '埃及', SV: '萨尔瓦多', GQ: '赤道几内亚', ER: '厄立特里亚',
  EE: '爱沙尼亚', SZ: '斯威士兰', ET: '埃塞俄比亚', FJ: '斐济', FI: '芬兰',
  FR: '法国', GA: '加蓬', GM: '冈比亚', GE: '格鲁吉亚', DE: '德国',
  GH: '加纳', GR: '希腊', GD: '格林纳达', GT: '危地马拉', GN: '几内亚',
  GW: '几内亚比绍', GY: '圭亚那', HT: '海地', HN: '洪都拉斯', HU: '匈牙利',
  IS: '冰岛', IN: '印度', ID: '印度尼西亚', IR: '伊朗', IQ: '伊拉克',
  IE: '爱尔兰', IL: '以色列', IT: '意大利', JM: '牙买加', JP: '日本',
  JO: '约旦', KZ: '哈萨克斯坦', KE: '肯尼亚', KI: '基里巴斯', KP: '朝鲜',
  KR: '韩国', KW: '科威特', KG: '吉尔吉斯斯坦', LA: '老挝', LV: '拉脱维亚',
  LB: '黎巴嫩', LS: '莱索托', LR: '利比里亚', LY: '利比亚', LI: '列支敦士登',
  LT: '立陶宛', LU: '卢森堡', MG: '马达加斯加', MW: '马拉维', MY: '马来西亚',
  MV: '马尔代夫', ML: '马里', MT: '马耳他', MH: '马绍尔群岛', MR: '毛里塔尼亚',
  MU: '毛里求斯', MX: '墨西哥', FM: '密克罗尼西亚', MD: '摩尔多瓦', MC: '摩纳哥',
  MN: '蒙古', ME: '黑山', MA: '摩洛哥', MZ: '莫桑比克', MM: '缅甸',
  NA: '纳米比亚', NR: '瑙鲁', NP: '尼泊尔', NL: '荷兰', NZ: '新西兰',
  NI: '尼加拉瓜', NE: '尼日尔', NG: '尼日利亚', MK: '北马其顿', NO: '挪威',
  OM: '阿曼', PK: '巴基斯坦', PW: '帕劳', PS: '巴勒斯坦', PA: '巴拿马',
  PG: '巴布亚新几内亚', PY: '巴拉圭', PE: '秘鲁', PH: '菲律宾', PL: '波兰',
  PT: '葡萄牙', QA: '卡塔尔', RO: '罗马尼亚', RU: '俄罗斯', RW: '卢旺达',
  WS: '萨摩亚', SM: '圣马力诺', ST: '圣多美和普林西比', SA: '沙特阿拉伯', SN: '塞内加尔',
  RS: '塞尔维亚', SC: '塞舌尔', SL: '塞拉利昂', SG: '新加坡', SK: '斯洛伐克',
  SI: '斯洛文尼亚', SB: '所罗门群岛', SO: '索马里', ZA: '南非', SS: '南苏丹',
  ES: '西班牙', LK: '斯里兰卡', SD: '苏丹', SR: '苏里南', SE: '瑞典',
  CH: '瑞士', SY: '叙利亚', TW: '台湾', TJ: '塔吉克斯坦', TZ: '坦桑尼亚',
  TH: '泰国', TL: '东帝汶', TG: '多哥', TO: '汤加', TT: '特立尼达和多巴哥',
  TN: '突尼斯', TR: '土耳其', TM: '土库曼斯坦', TV: '图瓦卢', UG: '乌干达',
  UA: '乌克兰', AE: '阿联酋', GB: '英国', US: '美国', UY: '乌拉圭',
  UZ: '乌兹别克斯坦', VU: '瓦努阿图', VA: '梵蒂冈', VE: '委内瑞拉', VN: '越南',
  YE: '也门', ZM: '赞比亚', ZW: '津巴布韦', XK: '科索沃', HK: '香港', MO: '澳门',
};

const COUNTRIES_KM = {
  KH: 'កម្ពុជា', CN: 'ចិន', TH: 'ថៃ', VN: 'វៀតណាម', LA: 'ឡាវ',
  MM: 'មីយ៉ាន់ម៉ា', MY: 'ម៉ាឡេស៊ី', SG: 'សិង្ហបុរី', ID: 'ឥណ្ឌូនេស៊ី', PH: 'ហ្វីលីពីន',
  BN: 'ប្រុយណេ', TL: 'ទីម័រខាងកើត', JP: 'ជប៉ុន', KR: 'កូរ៉េខាងត្បូង', KP: 'កូរ៉េខាងជើង',
  IN: 'ឥណ្ឌា', PK: 'បាគីស្ថាន', BD: 'បង់ក្លាដែស', LK: 'ស្រីលង្កា', NP: 'នេប៉ាល់',
  BT: 'ភូតាន', MV: 'ម៉ាល់ឌីវ', AF: 'អាហ្វហ្គានីស្ថាន', MN: 'ម៉ុងហ្គោលី', HK: 'ហុងកុង',
  MO: 'ម៉ាកាវ', TW: 'តៃវ៉ាន់', US: 'សហរដ្ឋអាមេរិក', CA: 'កាណាដា', MX: 'ម៉ិកស៊ិក',
  GB: 'ចក្រភពអង់គ្លេស', FR: 'បារាំង', DE: 'អាល្លឺម៉ង់', IT: 'អ៊ីតាលី', ES: 'អេស្ប៉ាញ',
  PT: 'ព័រទុយហ្គាល់', NL: 'ហូឡង់', BE: 'បែលហ្ស៊ិក', CH: 'ស្វ៊ីស', AT: 'អូទ្រីស',
  SE: 'ស៊ុយអែត', NO: 'ន័រវែស', DK: 'ដាន់ម៉ាក', FI: 'ហ្វាំងឡង់', IS: 'អ៊ីស្លង់',
  IE: 'អៀរឡង់', GR: 'ក្រិក', PL: 'ប៉ូឡូញ', CZ: 'ឆែក', HU: 'ហុងគ្រី',
  RO: 'រូម៉ានី', BG: 'ប៊ុលហ្គារី', UA: 'អ៊ុយក្រែន', RU: 'រុស្ស៊ី', BY: 'បេឡារុស្ស',
  AU: 'អូស្ត្រាលី', NZ: 'នូវែលសេឡង់', FJ: 'ហ្វីជី', PG: 'ប៉ាពួញូវេហ្គីណេ',
  AE: 'អេមីរ៉ាត់អារ៉ាប់រួម', SA: 'អារ៉ាប៊ីសាអូឌីត', QA: 'កាតា', KW: 'កូវ៉ែត', BH: 'បារ៉ែន',
  OM: 'អូម៉ង់', YE: 'យេម៉ែន', IQ: 'អ៊ីរ៉ាក់', IR: 'អ៊ីរ៉ង់', IL: 'អ៊ីស្រាអែល',
  PS: 'ប៉ាឡេស្ទីន', JO: 'ហ្ស៊កដានី', LB: 'លីបង់', SY: 'ស៊ីរី', TR: 'តួរគី',
  EG: 'អេហ្ស៊ិប្ត', MA: 'ម៉ារ៉ុក', DZ: 'អាល់ហ្សេរី', TN: 'ទុយនីស៊ី', LY: 'លីប៊ី',
  SD: 'ស៊ូដង់', ET: 'អេត្យូពី', KE: 'កេនយ៉ា', TZ: 'តង់សានី', UG: 'អ៊ូហ្គង់ដា',
  RW: 'រវ៉ាន់ដា', NG: 'នីហ្សេរីយ៉ា', GH: 'ហ្គាណា', SN: 'សេណេហ្គាល់', CI: 'កូតឌីវ័រ',
  CM: 'កាមេរូន', ZA: 'អាហ្វ្រិកខាងត្បូង', MZ: 'ម៉ូសំប៊ិក', ZM: 'សំប៊ី', ZW: 'ស៊ីមបាបវ៉េ',
  MG: 'ម៉ាដាហ្គាស្ការ', MU: 'ម៉ូរីស', BR: 'ប្រេស៊ីល', AR: 'អាហ្សង់ទីន', CL: 'ស៊ីលី',
  CO: 'កូឡុំប៊ី', PE: 'ប៉េរូ', VE: 'វ៉េណេស៊ុយអេឡា', EC: 'អេក្វាឌ័រ', BO: 'បូលីវី',
  PY: 'ប៉ារ៉ាហ្គាយ', UY: 'អ៊ុយរូហ្គាយ', CU: 'គុយបា', JM: 'ហ្សាម៉ាអ៊ិក', HT: 'ហៃទី',
  DO: 'សាធារណរដ្ឋដូមីនីកែន', KZ: 'កាហ្សាក់ស្ថាន', UZ: 'អ៊ូសបេគីស្ថាន', TM: 'តួរកម៉េនីស្ថាន',
  KG: 'កៀរហ្គ៊ីស្ថាន', TJ: 'តាជីគីស្ថាន', AZ: 'អាស៊ែបៃហ្សង់', GE: 'ហ្សកហ្ស៊ី', AM: 'អាមេនី',
};

// Cambodia provinces: lowercase English name → Khmer
const KH_PROVINCES_KM = {
  'banteay meanchey': 'បន្ទាយមានជ័យ', 'battambang': 'បាត់ដំបង', 'kampong cham': 'កំពង់ចាម',
  'kampong chhnang': 'កំពង់ឆ្នាំង', 'kampong speu': 'កំពង់ស្ពឺ', 'kampong thom': 'កំពង់ធំ',
  'kampot': 'កំពត', 'kandal': 'កណ្ដាល', 'koh kong': 'កោះកុង', 'kratie': 'ក្រចេះ',
  'kratié': 'ក្រចេះ', 'mondulkiri': 'មណ្ឌលគិរី', 'phnom penh': 'ភ្នំពេញ',
  'preah vihear': 'ព្រះវិហារ', 'prey veng': 'ព្រៃវែង', 'pursat': 'ពោធិ៍សាត់',
  'ratanakiri': 'រតនគិរី', 'ratankiri': 'រតនគិរី', 'siem reap': 'សៀមរាប',
  'preah sihanouk': 'ព្រះសីហនុ', 'sihanoukville': 'ព្រះសីហនុ', 'stung treng': 'ស្ទឹងត្រែង',
  'svay rieng': 'ស្វាយរៀង', 'takeo': 'តាកែវ', 'takéo': 'តាកែវ',
  'oddar meanchey': 'ឧត្ដរមានជ័យ', 'kep': 'កែប', 'pailin': 'ប៉ៃលិន', 'tboung khmum': 'ត្បូងឃ្មុំ',
};

// China provinces: lowercase English name → 中文
const CN_PROVINCES_ZH = {
  'beijing': '北京', 'tianjin': '天津', 'shanghai': '上海', 'chongqing': '重庆',
  'hebei': '河北', 'shanxi': '山西', 'liaoning': '辽宁', 'jilin': '吉林',
  'heilongjiang': '黑龙江', 'jiangsu': '江苏', 'zhejiang': '浙江', 'anhui': '安徽',
  'fujian': '福建', 'jiangxi': '江西', 'shandong': '山东', 'henan': '河南',
  'hubei': '湖北', 'hunan': '湖南', 'guangdong': '广东', 'hainan': '海南',
  'sichuan': '四川', 'guizhou': '贵州', 'yunnan': '云南', 'shaanxi': '陕西',
  'gansu': '甘肃', 'qinghai': '青海', 'taiwan': '台湾', 'inner mongolia': '内蒙古',
  'guangxi': '广西', 'tibet': '西藏', 'ningxia': '宁夏', 'xinjiang': '新疆',
  'hong kong': '香港', 'macau': '澳门',
};

// Major cities: lowercase English name → Khmer (Cambodia) / 中文 (China)
const KH_CITIES_KM = {
  'phnom penh': 'ភ្នំពេញ', 'siem reap': 'សៀមរាប', 'battambang': 'បាត់ដំបង',
  'sihanoukville': 'ក្រុងព្រះសីហនុ', 'kampot': 'កំពត', 'kampong cham': 'កំពង់ចាម',
  'kampong thom': 'កំពង់ធំ', 'kampong chhnang': 'កំពង់ឆ្នាំង', 'kampong speu': 'កំពង់ស្ពឺ',
  'pursat': 'ពោធិ៍សាត់', 'kratie': 'ក្រចេះ', 'stung treng': 'ស្ទឹងត្រែង',
  'svay rieng': 'ស្វាយរៀង', 'takeo': 'តាកែវ', 'kep': 'កែប', 'pailin': 'ប៉ៃលិន',
  'banlung': 'បានលុង', 'sen monorom': 'សែនមនោរម្យ', 'senmonorom': 'សែនមនោរម្យ',
  'prey veng': 'ព្រៃវែង', 'tbong khmum': 'ត្បូងឃ្មុំ', 'koh kong': 'កោះកុង',
  'samraong': 'សំរោង', 'tbeng meanchey': 'ត្បែងមានជ័យ', 'bavet': 'បាវិត',
  'poipet': 'ប៉ោយប៉ែត', 'ta khmau': 'តាខ្មៅ', 'kandal': 'កណ្ដាល', 'kampong spoe': 'កំពង់ស្ពឺ',
};

const CN_CITIES_ZH = {
  'beijing': '北京', 'shanghai': '上海', 'tianjin': '天津', 'chongqing': '重庆',
  'guangzhou': '广州', 'shenzhen': '深圳', 'chengdu': '成都', 'hangzhou': '杭州',
  'wuhan': '武汉', "xi'an": '西安', 'xian': '西安', 'nanjing': '南京', 'suzhou': '苏州',
  'qingdao': '青岛', 'jinan': '济南', 'zhengzhou': '郑州', 'changsha': '长沙',
  'hefei': '合肥', 'fuzhou': '福州', 'xiamen': '厦门', 'kunming': '昆明',
  'guiyang': '贵阳', 'nanning': '南宁', 'haikou': '海口', 'lanzhou': '兰州',
  'xining': '西宁', 'yinchuan': '银川', 'urumqi': '乌鲁木齐', 'lhasa': '拉萨',
  'hohhot': '呼和浩特', 'shenyang': '沈阳', 'dalian': '大连', 'changchun': '长春',
  'harbin': '哈尔滨', 'shijiazhuang': '石家庄', 'taiyuan': '太原', 'nanchang': '南昌',
  'ningbo': '宁波', 'wuxi': '无锡', 'foshan': '佛山', 'dongguan': '东莞',
  'zhuhai': '珠海', 'sanya': '三亚', 'guilin': '桂林', 'luoyang': '洛阳',
  'hong kong': '香港', 'macau': '澳门', 'taipei': '台北',
};

module.exports = { COUNTRIES_ZH, COUNTRIES_KM, KH_PROVINCES_KM, CN_PROVINCES_ZH, KH_CITIES_KM, CN_CITIES_ZH };
