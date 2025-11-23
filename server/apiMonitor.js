/**
 * apiMonitor.js - Мониторинг использования API
 */

const fs = require('fs');
const path = require('path');

const STATS_PATH = path.join(__dirname, '../data/api_stats.json');

// Примерные цены за 1M токенов (USD)
const PRICING = {
  openai: {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 }
  },
  deepseek: {
    'deepseek-chat': { input: 0.14, output: 0.28 }
  }
};

class APIMonitor {
  constructor() {
    this.stats = this.loadStats();
  }

  /**
   * Загрузка статистики из файла
   */
  loadStats() {
    try {
      if (fs.existsSync(STATS_PATH)) {
        const data = fs.readFileSync(STATS_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[API Monitor] Ошибка загрузки статистики:', error.message);
    }
    
    // Начальная структура
    return {
      tavily: this.createEmptyStats(),
      deepseek: this.createEmptyStats(),
      openai: this.createEmptyStats(),
      last_reset: new Date().toISOString()
    };
  }

  /**
   * Создание пустой статистики для API
   */
  createEmptyStats() {
    return {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      total_tokens: {
        input: 0,
        output: 0,
        total: 0
      },
      total_cost_usd: 0,
      performance: {
        avg_response_time_ms: 0,
        min_response_time_ms: Infinity,
        max_response_time_ms: 0,
        total_response_time_ms: 0
      },
      daily: {},
      monthly: {},
      recent_requests: []
    };
  }

  /**
   * Сохранение статистики в файл
   */
  saveStats() {
    try {
      const dir = path.dirname(STATS_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATS_PATH, JSON.stringify(this.stats, null, 2), 'utf8');
    } catch (error) {
      console.error('[API Monitor] Ошибка сохранения статистики:', error.message);
    }
  }

  /**
   * Логирование запроса к API
   */
  logRequest(apiName, operation, data = {}) {
    const stats = this.stats[apiName];
    if (!stats) return;

    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const monthKey = dateKey.substring(0, 7); // YYYY-MM

    // Обновление счетчиков
    stats.total_requests++;
    
    if (data.success !== false) {
      stats.successful_requests++;
    } else {
      stats.failed_requests++;
    }

    // Токены (для OpenAI и DeepSeek)
    if (data.tokens) {
      stats.total_tokens.input += data.tokens.input || 0;
      stats.total_tokens.output += data.tokens.output || 0;
      stats.total_tokens.total += (data.tokens.input || 0) + (data.tokens.output || 0);

      // Расчет стоимости
      if (data.model && PRICING[apiName] && PRICING[apiName][data.model]) {
        const price = PRICING[apiName][data.model];
        const cost = (
          (data.tokens.input || 0) / 1000000 * price.input +
          (data.tokens.output || 0) / 1000000 * price.output
        );
        stats.total_cost_usd += cost;
      }
    }

    // Время выполнения
    if (data.response_time_ms !== undefined) {
      stats.performance.total_response_time_ms += data.response_time_ms;
      stats.performance.avg_response_time_ms = 
        stats.performance.total_response_time_ms / stats.total_requests;
      stats.performance.min_response_time_ms = 
        Math.min(stats.performance.min_response_time_ms, data.response_time_ms);
      stats.performance.max_response_time_ms = 
        Math.max(stats.performance.max_response_time_ms, data.response_time_ms);
    }

    // Статистика по дням
    if (!stats.daily[dateKey]) {
      stats.daily[dateKey] = { requests: 0, tokens: 0, cost: 0 };
    }
    stats.daily[dateKey].requests++;
    if (data.tokens) {
      stats.daily[dateKey].tokens += (data.tokens.input || 0) + (data.tokens.output || 0);
    }

    // Статистика по месяцам
    if (!stats.monthly[monthKey]) {
      stats.monthly[monthKey] = { requests: 0, tokens: 0, cost: 0 };
    }
    stats.monthly[monthKey].requests++;
    if (data.tokens) {
      stats.monthly[monthKey].tokens += (data.tokens.input || 0) + (data.tokens.output || 0);
    }

    // История последних запросов (храним последние 20)
    stats.recent_requests.unshift({
      timestamp: now.toISOString(),
      operation,
      response_time_ms: data.response_time_ms,
      tokens: data.tokens,
      model: data.model,
      success: data.success !== false,
      error: data.error
    });
    
    if (stats.recent_requests.length > 20) {
      stats.recent_requests = stats.recent_requests.slice(0, 20);
    }

    this.saveStats();
  }

  /**
   * Получение статистики
   */
  getStats(apiName = null) {
    if (apiName) {
      return this.stats[apiName];
    }
    return this.stats;
  }

  /**
   * Сброс статистики
   */
  resetStats(apiName = null) {
    if (apiName) {
      this.stats[apiName] = this.createEmptyStats();
    } else {
      this.stats = {
        tavily: this.createEmptyStats(),
        deepseek: this.createEmptyStats(),
        openai: this.createEmptyStats(),
        last_reset: new Date().toISOString()
      };
    }
    this.saveStats();
  }

  /**
   * Получение статистики за сегодня
   */
  getTodayStats() {
    const today = new Date().toISOString().split('T')[0];
    const result = {};
    
    ['tavily', 'deepseek', 'openai'].forEach(api => {
      result[api] = this.stats[api].daily[today] || { requests: 0, tokens: 0, cost: 0 };
    });
    
    return result;
  }

  /**
   * Получение статистики за текущий месяц
   */
  getMonthStats() {
    const month = new Date().toISOString().substring(0, 7);
    const result = {};
    
    ['tavily', 'deepseek', 'openai'].forEach(api => {
      result[api] = this.stats[api].monthly[month] || { requests: 0, tokens: 0, cost: 0 };
    });
    
    return result;
  }
}

// Singleton instance
const apiMonitor = new APIMonitor();

module.exports = apiMonitor;

