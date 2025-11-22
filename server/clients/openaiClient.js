const axios = require('axios');

class OpenAIClient {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = 'https://api.openai.com/v1';
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
  }

  /**
   * Валидация и фактчекинг результатов
   */
  async validate(prompt, options = {}) {
    try {
      console.log('[OpenAI] Валидация результатов...');
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: options.model || 'gpt-4o-mini',
          messages: [
            { 
              role: 'system', 
              content: 'Ты эксперт-металлург, специализирующийся на валидации марок сталей и проверке фактов. Твоя задача - проверить точность данных об аналогах сталей.' 
            },
            { 
              role: 'user', 
              content: prompt 
            }
          ],
          temperature: options.temperature || 0.3,
          max_tokens: options.max_tokens || 3000,
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
        console.error('[OpenAI] Ошибка парсинга ответа:', content);
        throw new Error('Неверный JSON ответ от OpenAI API');
      }

    } catch (error) {
      if (error.response) {
        console.error('[OpenAI] Ошибка API:', error.response.data);
        throw new Error(`Ошибка OpenAI API: ${error.response.data.error?.message || 'Неизвестная ошибка'}`);
      } else if (error.request) {
        console.error('[OpenAI] Нет ответа от API');
        throw new Error('Нет ответа от OpenAI API');
      } else {
        console.error('[OpenAI] Ошибка клиента:', error.message);
        throw error;
      }
    }
  }
}

module.exports = new OpenAIClient();

