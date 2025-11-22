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
   */
  async multiSearch(queries) {
    console.log(`[Tavily] Executing ${queries.length} search queries...`);
    
    const results = [];
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log(`[Tavily] Query ${i + 1}/${queries.length}: ${query.substring(0, 60)}...`);
      
      try {
        const result = await this.search(query);
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
        console.error(`[Tavily] Query failed: ${error.message}`);
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
   */
  async search(query) {
    try {
      const response = await axios.post(
        `${this.baseURL}/search`,
        {
          api_key: this.apiKey,
          query: query,
          search_depth: 'basic',
          max_results: 5
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
      console.error('[Tavily] API error:', error.message);
      throw error;
    }
  }
}

module.exports = new TavilyClient();

