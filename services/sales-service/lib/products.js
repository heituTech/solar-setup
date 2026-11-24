'use strict';

// 用户可见的商品分类（统一英文，原样存储到数据库）
const USER_CATEGORIES = [
  'PV module',
  'Invertor',
  'battery',
  'mounting bracket',
  'Cable',
  'Color Coated Steel Tile',
  'Other',
];

// 系统内部分类：被订单创建 / 套餐逻辑依赖，不出现在前端下拉，但允许存在于库中
const SYSTEM_CATEGORIES = ['package', 'survey_service'];

const ALL_CATEGORIES = [...USER_CATEGORIES, ...SYSTEM_CATEGORIES];
const ALLOWED_CATEGORIES = new Set(ALL_CATEGORIES);

// 各分类的默认单位（创建商品时若未指定单位则自动填充）
const DEFAULT_UNITS = {
  'PV module': 'pcs',
  'Invertor': 'pcs',
  'battery': 'pcs',
  'mounting bracket': '米',
  'Cable': '米',
  'Color Coated Steel Tile': '平方米',
  'Other': 'pcs',
};

function defaultUnitFor(category) {
  return DEFAULT_UNITS[category] || 'pcs';
}

function isAllowedCategory(category) {
  return ALLOWED_CATEGORIES.has(String(category));
}

module.exports = {
  USER_CATEGORIES,
  SYSTEM_CATEGORIES,
  ALL_CATEGORIES,
  DEFAULT_UNITS,
  defaultUnitFor,
  isAllowedCategory,
};
