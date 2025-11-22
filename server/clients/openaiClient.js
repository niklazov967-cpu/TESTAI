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
      console.log('[OpenAI] Validating results...');
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: options.model || 'gpt-4o-mini',
          messages: [
            { 
              role: 'system', 
              content: 'You are an expert metallurgist specializing in steel grades validation and fact-checking. Your task is to verify the accuracy of steel analog data.' 
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
        console.error('[OpenAI] Failed to parse response:', content);
        throw new Error('Invalid JSON response from OpenAI API');
      }

    } catch (error) {
      if (error.response) {
        console.error('[OpenAI] API error:', error.response.data);
        throw new Error(`OpenAI API error: ${error.response.data.error?.message || 'Unknown error'}`);
      } else if (error.request) {
        console.error('[OpenAI] No response from API');
        throw new Error('No response from OpenAI API');
      } else {
        console.error('[OpenAI] Client error:', error.message);
        throw error;
      }
    }
  }
}

module.exports = new OpenAIClient();

