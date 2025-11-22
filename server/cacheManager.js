/**
 * cacheManager.js - Менеджер кэша
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '../data/cache.json');

/**
 * Загрузка кэша
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = fs.readFileSync(CACHE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Cache] Error loading cache:', error.message);
  }
  return {};
}

/**
 * Сохранение кэша
 */
function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('[Cache] Error saving cache:', error.message);
  }
}

/**
 * Получить запись из кэша
 */
function get(steelGrade) {
  const cache = loadCache();
  const normalized = steelGrade.trim().toUpperCase();
  return cache[normalized] || null;
}

/**
 * Сохранить запись в кэш
 */
function save(steelGrade, data) {
  const cache = loadCache();
  const normalized = steelGrade.trim().toUpperCase();
  cache[normalized] = {
    ...data,
    cached_at: new Date().toISOString()
  };
  saveCache(cache);
}

/**
 * Очистить кэш
 */
function clear() {
  saveCache({});
}

module.exports = {
  get,
  save,
  clear
};

