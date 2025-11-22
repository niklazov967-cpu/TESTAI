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
      console.log('[DeepSeek] Processing data...');
      
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
        console.error('[DeepSeek] Failed to parse response:', content);
        throw new Error('Invalid JSON response from DeepSeek API');
      }

    } catch (error) {
      if (error.response) {
        console.error('[DeepSeek] API error:', error.response.data);
        throw new Error(`DeepSeek API error: ${error.response.data.error?.message || 'Unknown error'}`);
      } else if (error.request) {
        console.error('[DeepSeek] No response from API');
        throw new Error('No response from DeepSeek API');
      } else {
        console.error('[DeepSeek] Client error:', error.message);
        throw error;
      }
    }
  }
}

module.exports = new DeepSeekClient();

