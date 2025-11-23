#!/usr/bin/env node

/**
 * Скрипт для проверки балансов всех API
 * Использование: node check-balance.js
 */

require('dotenv').config();

// Проверяем наличие API ключей перед загрузкой клиентов
let tavilyClient, deepseekClient, openaiClient;

if (process.env.TAVILY_API_KEY) {
  try {
    tavilyClient = require('./server/clients/tavilyClient');
  } catch (e) {
    // Клиент не загружен из-за отсутствия ключа или другой ошибки
  }
}

if (process.env.DEEPSEEK_API_KEY) {
  try {
    deepseekClient = require('./server/clients/deepseekClient');
  } catch (e) {
    // Клиент не загружен из-за отсутствия ключа или другой ошибки
  }
}

if (process.env.OPENAI_API_KEY) {
  try {
    openaiClient = require('./server/clients/openaiClient');
  } catch (e) {
    // Клиент не загружен из-за отсутствия ключа или другой ошибки
  }
}

async function checkAllBalances() {
  console.log('🔍 Проверка балансов API...\n');
  console.log('='.repeat(60));

  // Tavily
  console.log('\n📊 Tavily API:');
  console.log('-'.repeat(60));
  if (!tavilyClient) {
    console.log('⚠️  API ключ не настроен (TAVILY_API_KEY)');
    console.log('💡 Проверьте баланс вручную: https://tavily.com/dashboard');
  } else {
    try {
      const tavilyBalance = await tavilyClient.checkBalance();
      if (tavilyBalance.success) {
        console.log('✅ Успешно получен баланс');
        console.log('Данные:', JSON.stringify(tavilyBalance.data, null, 2));
      } else {
        console.log('⚠️  Не удалось получить баланс через API');
        console.log('Сообщение:', tavilyBalance.message);
        if (tavilyBalance.error) {
          console.log('Ошибка:', tavilyBalance.error);
        }
        console.log('💡 Проверьте баланс вручную: https://tavily.com/dashboard');
      }
    } catch (error) {
      console.log('❌ Ошибка:', error.message);
      console.log('💡 Проверьте баланс вручную: https://tavily.com/dashboard');
    }
  }

  // DeepSeek
  console.log('\n📊 DeepSeek API:');
  console.log('-'.repeat(60));
  if (!deepseekClient) {
    console.log('⚠️  API ключ не настроен (DEEPSEEK_API_KEY)');
    console.log('💡 Проверьте баланс вручную: https://platform.deepseek.com');
  } else {
    try {
      const deepseekBalance = await deepseekClient.checkBalance();
      if (deepseekBalance.success) {
        console.log('✅ Успешно получен баланс');
        console.log('Данные:', JSON.stringify(deepseekBalance.data, null, 2));
      } else {
        console.log('⚠️  Не удалось получить баланс через API');
        console.log('Сообщение:', deepseekBalance.message);
        if (deepseekBalance.error) {
          console.log('Ошибка:', deepseekBalance.error);
        }
        console.log('💡 Проверьте баланс вручную: https://platform.deepseek.com');
      }
    } catch (error) {
      console.log('❌ Ошибка:', error.message);
      console.log('💡 Проверьте баланс вручную: https://platform.deepseek.com');
    }
  }

  // OpenAI
  console.log('\n📊 OpenAI API:');
  console.log('-'.repeat(60));
  if (!openaiClient) {
    console.log('⚠️  API ключ не настроен (OPENAI_API_KEY)');
    console.log('💡 Проверьте баланс вручную: https://platform.openai.com/usage');
  } else {
    try {
      const openaiBalance = await openaiClient.checkBalance();
      if (openaiBalance.success) {
        console.log('✅ Успешно получен баланс');
        console.log('Данные:', JSON.stringify(openaiBalance.data, null, 2));
      } else {
        console.log('⚠️  Не удалось получить баланс через API');
        console.log('Сообщение:', openaiBalance.message);
        if (openaiBalance.error) {
          console.log('Ошибка:', openaiBalance.error);
        }
        console.log('💡 Проверьте баланс вручную: https://platform.openai.com/usage');
      }
    } catch (error) {
      console.log('❌ Ошибка:', error.message);
      console.log('💡 Проверьте баланс вручную: https://platform.openai.com/usage');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Проверка завершена!');
}

// Запуск
checkAllBalances().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
