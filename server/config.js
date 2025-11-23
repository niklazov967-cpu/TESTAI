/**
 * config.js - Менеджер конфигурации
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../data/config.json');
const STANDARDS_CONFIG_PATH = path.join(__dirname, '../data/standards_config.json');

// Конфигурация по умолчанию
const DEFAULT_CONFIG = {
  cache_enabled: true,
  validation_strictness: 'medium',
  max_iterations: 3,
  tavily_max_results: 5,
  deepseek_temperature: 0.7,
  openai_temperature: 0.3,
  openai_model: 'gpt-4o-mini'
};

/**
 * Загрузка конфигурации
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('[Config] Error loading config:', error.message);
  }
  
  // Создание файла конфигурации по умолчанию
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

/**
 * Сохранение конфигурации
 */
function saveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('[Config] Error saving config:', error.message);
  }
}

/**
 * Получить конфигурацию
 */
function getConfig() {
  return loadConfig();
}

/**
 * Обновить конфигурацию
 */
function updateConfig(updates) {
  const current = loadConfig();
  const updated = { ...current, ...updates };
  saveConfig(updated);
  return updated;
}

/**
 * Загрузка конфигурации стандартов
 */
function loadStandardsConfig() {
  try {
    if (fs.existsSync(STANDARDS_CONFIG_PATH)) {
      const data = fs.readFileSync(STANDARDS_CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Config] Error loading standards config:', error.message);
  }
  
  // Возвращаем пустой объект, если файл не найден
  return null;
}

/**
 * Сохранение конфигурации стандартов
 */
function saveStandardsConfig(config) {
  try {
    const dir = path.dirname(STANDARDS_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STANDARDS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('[Config] Error saving standards config:', error.message);
    throw error;
  }
}

/**
 * Получить конфигурацию стандартов
 */
function getStandardsConfig() {
  return loadStandardsConfig();
}

/**
 * Обновить конфигурацию стандартов
 */
function updateStandardsConfig(updates) {
  const current = loadStandardsConfig();
  if (!current) {
    throw new Error('Standards config not found');
  }
  const updated = { ...current, ...updates };
  saveStandardsConfig(updated);
  return updated;
}

module.exports = {
  getConfig,
  updateConfig,
  getStandardsConfig,
  updateStandardsConfig,
  loadStandardsConfig
};

