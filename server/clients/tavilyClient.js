const axios = require('axios');

class TavilyClient {
  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY;
    this.baseURL = 'https://api.tavily.com';
    
    if (!this.apiKey) {
      throw new Error('TAVILY_API_KEY is not set in environment variables');
    }
  }

  /**
   * Выполнить множественные поисковые запросы
   * @param {Array} queries - Массив поисковых запросов
   * @param {Object} config - Конфигурация (опционально)
   */
  async multiSearch(queries, config = {}) {
    const maxResults = config.tavily_max_results || 5;
    console.log(`[Tavily] Выполнение ${queries.length} поисковых запросов (max_results: ${maxResults})...`);
    
    const results = [];
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log(`[Tavily] Запрос ${i + 1}/${queries.length}: ${query.substring(0, 60)}...`);
      
      try {
        const result = await this.search(query, maxResults);
        results.push({
          query,
          results: result.results,
          success: true
        });
        
        // Задержка между запросами
        if (i < queries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`[Tavily] Ошибка запроса: ${error.message}`);
        results.push({
          query,
          results: [],
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Выполнить один поисковый запрос
   * @param {string} query - Поисковый запрос
   * @param {number} maxResults - Максимальное количество результатов (по умолчанию 5)
   */
  async search(query, maxResults = 5) {
    try {
      const response = await axios.post(
        `${this.baseURL}/search`,
        {
          api_key: this.apiKey,
          query: query,
          search_depth: 'basic',
          max_results: maxResults
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      return {
        results: response.data.results.map(item => ({
          title: item.title,
          url: item.url,
          content: item.content,
          score: item.score || 0
        }))
      };

    } catch (error) {
      console.error('[Tavily] Ошибка API:', error.message);
      throw error;
    }
  }

  /**
   * Проверить баланс/использование API
   */
  async checkBalance() {
    try {
      const response = await axios.get(
        `${this.baseURL}/usage`,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          params: {
            api_key: this.apiKey
          },
          timeout: 10000
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      // Tavily может не иметь endpoint для баланса, возвращаем информацию об ошибке
      if (error.response && error.response.status === 404) {
        return {
          success: false,
          message: 'Эндпоинт проверки баланса недоступен. Проверьте баланс на https://tavily.com/dashboard',
          error: 'Endpoint not found'
        };
      }
      return {
        success: false,
        message: error.response?.data?.error || error.message,
        error: error.message
      };
    }
  }
}

module.exports = new TavilyClient();

