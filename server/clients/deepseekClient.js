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
   * Поддерживает deepseek-chat и deepseek-reasoner
   * С автоматическими повторными попытками при сбоях
   */
  async processData(prompt, options = {}) {
    const model = options.model || 'deepseek-chat';
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s
          console.log(`[DeepSeek] Повторная попытка ${attempt}/${maxRetries} через ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        return await this._makeRequest(prompt, model, options);
        
      } catch (error) {
        lastError = error;
        
        // Если это последняя попытка или ошибка не подлежит retry - выбрасываем
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Retry только для ошибок сети или таймаутов
        if (error.message.includes('Нет ответа') || 
            error.message.includes('timeout') || 
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT') {
          console.warn(`[DeepSeek] Попытка ${attempt}/${maxRetries} не удалась: ${error.message}`);
          continue;
        }
        
        // Для других ошибок (например, ошибки API) - сразу выбрасываем
        throw error;
      }
    }
    
    throw lastError;
  }
  
  /**
   * Внутренний метод для выполнения запроса
   */
  async _makeRequest(prompt, model, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log(`[DeepSeek] Обработка данных (модель: ${model})...`);
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: model,
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
          timeout: 90000 // Увеличен до 90 секунд для больших запросов
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
        model: model
      });
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('[DeepSeek] Ошибка парсинга JSON ответа');
        console.error('[DeepSeek] Модель:', model);
        console.error('[DeepSeek] Длина ответа:', content.length, 'символов');
        console.error('[DeepSeek] Первые 500 символов:', content.substring(0, 500));
        console.error('[DeepSeek] Последние 500 символов:', content.substring(Math.max(0, content.length - 500)));
        console.error('[DeepSeek] Ошибка парсинга:', parseError.message);
        
        // Попытка найти JSON в ответе (иногда модель добавляет текст до/после JSON)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            console.log('[DeepSeek] Попытка извлечь JSON из текста...');
            return JSON.parse(jsonMatch[0]);
          } catch (secondError) {
            console.error('[DeepSeek] Вторая попытка парсинга не удалась');
          }
        }
        
        throw new Error(`Неверный JSON ответ от DeepSeek API (модель: ${model}). Проверьте логи для деталей.`);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Логирование ошибки
      apiMonitor.logRequest('deepseek', 'process', {
        success: false,
        response_time_ms: responseTime,
        error: error.message,
        model: model
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

