const axios = require('axios');

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

      const content = response.data.choices[0].message.content;
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('[DeepSeek] Ошибка парсинга ответа:', content);
        throw new Error('Неверный JSON ответ от DeepSeek API');
      }

    } catch (error) {
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

