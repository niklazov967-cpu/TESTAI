const axios = require('axios');
const apiMonitor = require('../apiMonitor');

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
    const startTime = Date.now();
    const model = options.model || 'gpt-4o-mini';
    
    try {
      console.log('[OpenAI] Валидация результатов...');
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model,
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

      const responseTime = Date.now() - startTime;
      const content = response.data.choices[0].message.content;
      
      // Логирование успешного запроса
      const tokens = {
        input: response.data.usage?.prompt_tokens || 0,
        output: response.data.usage?.completion_tokens || 0
      };
      
      apiMonitor.logRequest('openai', 'validate', {
        success: true,
        response_time_ms: responseTime,
        tokens,
        model
      });
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('[OpenAI] Ошибка парсинга ответа:', content);
        throw new Error('Неверный JSON ответ от OpenAI API');
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Логирование ошибки
      apiMonitor.logRequest('openai', 'validate', {
        success: false,
        response_time_ms: responseTime,
        error: error.message,
        model
      });
      
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

  /**
   * Обработка данных (для Stage 2 в режиме запасного варианта)
   * Используется, когда DeepSeek Chat и Reasoner не смогли пройти валидацию
   */
  async processData(prompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || 'gpt-4o-mini';
    
    try {
      console.log('[OpenAI] Обработка данных через OpenAI...');
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model,
          messages: [
            { 
              role: 'system', 
              content: 'Ты эксперт-металлург, специализирующийся на подборе аналогов сталей. Отвечай всегда в формате JSON.' 
            },
            { 
              role: 'user', 
              content: prompt 
            }
          ],
          temperature: options.temperature || 0.3,
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
      
      apiMonitor.logRequest('openai', 'processData', {
        success: true,
        response_time_ms: responseTime,
        tokens,
        model
      });
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('[OpenAI] Ошибка парсинга ответа:', content);
        throw new Error('Неверный JSON ответ от OpenAI API');
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Логирование ошибки
      apiMonitor.logRequest('openai', 'processData', {
        success: false,
        response_time_ms: responseTime,
        error: error.message,
        model
      });
      
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

