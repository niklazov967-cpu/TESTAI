/**
 * cacheManager.js - Менеджер кэша
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '../data/cache.json');
const STANDARDS_CACHE_PATH = path.join(__dirname, '../data/standards_cache.json');

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

/**
 * Получить весь кэш (для администрирования)
 */
function getAll() {
  return loadCache();
}

/**
 * Удалить конкретную запись из кэша
 */
function deleteEntry(steelGrade) {
  const cache = loadCache();
  const normalized = steelGrade.trim().toUpperCase();
  if (cache[normalized]) {
    delete cache[normalized];
    saveCache(cache);
    console.log(`[Cache] Удалена запись: ${normalized}`);
    return true;
  }
  return false;
}

/**
 * Получить информацию о кэше (размер, количество записей)
 */
function getInfo() {
  const cache = loadCache();
  const keys = Object.keys(cache);
  const cacheString = JSON.stringify(cache);
  const sizeInBytes = Buffer.byteLength(cacheString, 'utf8');
  
  return {
    count: keys.length,
    size_bytes: sizeInBytes,
    size_mb: (sizeInBytes / (1024 * 1024)).toFixed(2),
    entries: keys.map(key => ({
      key,
      steel: key,
      timestamp: cache[key].cached_at || 'unknown',
      size: Buffer.byteLength(JSON.stringify(cache[key]), 'utf8'),
      analogs_count: cache[key].analogs?.length || 0
    }))
  };
}

/**
 * Загрузка кэша стандартов
 */
function loadStandardsCache() {
  try {
    if (fs.existsSync(STANDARDS_CACHE_PATH)) {
      const data = fs.readFileSync(STANDARDS_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      // Если это массив, преобразуем в объект
      if (Array.isArray(parsed)) {
        const obj = {};
        parsed.forEach((item) => {
          if (item.input_standard || item.standard_code) {
            const key = (item.input_standard || item.standard_code).trim().toUpperCase();
            obj[key] = item;
          }
        });
        return obj;
      }
      return parsed;
    }
  } catch (error) {
    console.error('[Cache] Error loading standards cache:', error.message);
  }
  return {};
}

/**
 * Сохранение кэша стандартов
 */
function saveStandardsCache(cache) {
  try {
    const dir = path.dirname(STANDARDS_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Сохраняем как объект, а не массив
    fs.writeFileSync(STANDARDS_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('[Cache] Error saving standards cache:', error.message);
  }
}

/**
 * Получить запись из кэша стандартов
 */
function getStandards(standardCode) {
  const cache = loadStandardsCache();
  const normalized = standardCode.trim().toUpperCase();
  return cache[normalized] || null;
}

/**
 * Сохранить запись в кэш стандартов
 */
function saveStandards(standardCode, data) {
  const cache = loadStandardsCache();
  const normalized = standardCode.trim().toUpperCase();
  cache[normalized] = {
    ...data,
    cached_at: new Date().toISOString()
  };
  saveStandardsCache(cache);
}

/**
 * Очистить кэш стандартов
 */
function clearStandards() {
  saveStandardsCache({});
}

/**
 * Получить весь кэш стандартов (для администрирования)
 */
function getAllStandards() {
  return loadStandardsCache();
}

/**
 * Удалить конкретную запись из кэша стандартов
 */
function deleteStandardsEntry(standardCode) {
  const cache = loadStandardsCache();
  const normalized = standardCode.trim().toUpperCase();
  if (cache[normalized]) {
    delete cache[normalized];
    saveStandardsCache(cache);
    console.log(`[Cache Standards] Удалена запись: ${normalized}`);
    return true;
  }
  return false;
}

/**
 * Получить информацию о кэше стандартов
 */
function getStandardsInfo() {
  const cache = loadStandardsCache();
  const keys = Object.keys(cache);
  const cacheString = JSON.stringify(cache);
  const sizeInBytes = Buffer.byteLength(cacheString, 'utf8');
  
  return {
    count: keys.length,
    size_bytes: sizeInBytes,
    size_mb: (sizeInBytes / (1024 * 1024)).toFixed(2),
    entries: keys.map(key => ({
      key,
      standard: key,
      timestamp: cache[key].cached_at || 'unknown',
      size: Buffer.byteLength(JSON.stringify(cache[key]), 'utf8'),
      equivalents_count: cache[key].equivalents?.length || 0
    }))
  };
}

module.exports = {
  get,
  save,
  clear,
  getAll,
  deleteEntry,
  getInfo,
  getStandards,
  saveStandards,
  clearStandards,
  getAllStandards,
  deleteStandardsEntry,
  getStandardsInfo,
  loadStandardsCache
};

