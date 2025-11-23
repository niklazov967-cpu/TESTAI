const axios = require('axios');
const apiMonitor = require('../apiMonitor');

class DeepSeekClient {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseURL = 'https://api.deepseek.com/v1';
    
    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set in environment variables');
    }
  }

  /**
   * Обработка данных и поиск аналогов
   */
  async processData(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log('[DeepSeek] Обработка данных...');
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 4000,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const responseTime = Date.now() - startTime;
      const content = response.data.choices[0].message.content;
      
      // Логирование успешного запроса
      const tokens = {
        input: response.data.usage?.prompt_tokens || 0,
        output: response.data.usage?.completion_tokens || 0
      };
      
      apiMonitor.logRequest('deepseek', 'process', {
        success: true,
        response_time_ms: responseTime,
        tokens,
        model: 'deepseek-chat'
      });
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('[DeepSeek] Ошибка парсинга ответа:', content);
        throw new Error('Неверный JSON ответ от DeepSeek API');
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Логирование ошибки
      apiMonitor.logRequest('deepseek', 'process', {
        success: false,
        response_time_ms: responseTime,
        error: error.message,
        model: 'deepseek-chat'
      });
      
      if (error.response) {
        console.error('[DeepSeek] Ошибка API:', error.response.data);
        throw new Error(`Ошибка DeepSeek API: ${error.response.data.error?.message || 'Неизвестная ошибка'}`);
      } else if (error.request) {
        console.error('[DeepSeek] Нет ответа от API');
        throw new Error('Нет ответа от DeepSeek API');
      } else {
        console.error('[DeepSeek] Ошибка клиента:', error.message);
        throw error;
      }
    }
  }
}

module.exports = new DeepSeekClient();

