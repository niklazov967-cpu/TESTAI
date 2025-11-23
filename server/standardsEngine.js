const cacheManager = require('./cacheManager');
const configManager = require('./config');
const stage1Search = require('./stages/stage1_standards_search');
const stage2Process = require('./stages/stage2_standards_process');
const stage2ProcessOpenAI = require('./stages/stage2_standards_process_openai');
const stage3Validate = require('./stages/stage3_standards_validate');

/**
 * Главная функция поиска эквивалентов стандартов (3-этапный конвейер)
 * @param {string} standardCode - Код стандарта
 * @param {string} standardType - Тип стандарта (опционально)
 * @param {function} progressCallback - Функция для отправки обновлений прогресса
 */
async function findEquivalents(standardCode, standardType, progressCallback = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Запуск 3-этапного конвейера поиска для стандарта: ${standardCode}`);
  console.log(`${'='.repeat(60)}\n`);

  // Функция для отправки событий
  const sendProgress = (event, data) => {
    if (progressCallback) {
      progressCallback(event, data);
    }
  };

  // Загрузка конфигурации
  let config = configManager.getStandardsConfig();
  if (!config) {
    throw new Error('Конфигурация стандартов не найдена');
  }

  // Проверка кэша
  if (config.cache_settings.enabled) {
    const cached = cacheManager.getStandards(standardCode);
    if (cached) {
      console.log('✅ Найдено в кэше');
      sendProgress('cached', { cached: true });
      return {
        ...cached,
        cached: true
      };
    }
  }

  try {
    // ========================================
    // ЭТАП 1: Tavily Search (Поиск данных)
    // ========================================
    console.log('\n📡 ЭТАП 1: Поиск через Tavily');
    console.log('─'.repeat(60));
    
    sendProgress('stage1_start', { 
      stage: 1, 
      message: 'Запуск поиска данных через Tavily...',
      timestamp: Date.now()
    });
    
    const searchData = await stage1Search.execute(standardCode, standardType, config);
    
    console.log(`✅ Этап 1 завершен: найдено ${searchData.sources_count} источников`);
    console.log(`   - Выполнено поисковых запросов: ${searchData.queries_executed}`);
    
    sendProgress('stage1_complete', {
      stage: 1,
      message: 'Поиск данных завершен',
      sources_count: searchData.sources_count,
      queries_executed: searchData.queries_executed,
      total_results: searchData.total_results,
      total_results_from_queries: searchData.total_results_from_queries || searchData.sources_count,
      successful_queries: searchData.successful_queries || searchData.queries_executed,
      duplicates_removed: searchData.duplicates_removed || 0,
      timestamp: Date.now()
    });

    // ========================================
    // ЭТАП 2 + 3: Обработка и Валидация с ЭСКАЛАЦИЕЙ
    // ========================================
    // Система эскалации (аналогично searchEngine.js):
    // 1. Попытка 1: DeepSeek Chat (быстрая и дешевая модель)
    // 2. Попытка 2: DeepSeek Reasoner (умная модель) - если валидация < 70
    // 3. Попытка 3: OpenAI GPT-4o-mini (самая надежная) - если все еще < 70
    
    let attempt = 1;
    const maxAttempts = 3;
    let modelUsed = 'deepseek-chat';
    let equivalents = null;
    let validation = null;
    
    // ПОПЫТКА 1: DeepSeek Chat
    console.log('\n🤖 ЭТАП 2 (Попытка 1/3): Обработка через DeepSeek Chat');
    console.log('─'.repeat(60));
    
    sendProgress('stage2_start', {
      stage: 2,
      message: '💬 Обработка данных через DeepSeek Chat...',
      attempt: attempt,
      model: modelUsed,
      timestamp: Date.now()
    });
    
    // Передаем модель в config
    const stage2Config = { ...config, deepseek_model: modelUsed };
    equivalents = await stage2Process.execute(standardCode, standardType, searchData, stage2Config);
    
    console.log(`✅ Этап 2 (попытка ${attempt}) завершен: обработка через ${modelUsed}`);
    
    sendProgress('stage2_complete', {
      stage: 2,
      message: 'Обработка данных завершена',
      model: modelUsed,
      attempt: attempt,
      timestamp: Date.now()
    });
    
    // ========================================
    // ЭТАП 3: Валидация
    // ========================================
    console.log('\n✅ ЭТАП 3 (Попытка 1/3): Валидация через OpenAI');
    console.log('─'.repeat(60));
    
    sendProgress('stage3_start', {
      stage: 3,
      message: 'Валидация результатов через OpenAI...',
      attempt: attempt,
      timestamp: Date.now()
    });
    
    validation = await stage3Validate.execute(standardCode, equivalents, config);
    
    const validationScore = validation.overall_score;
    console.log(`✅ Этап 3 (попытка ${attempt}) завершен: оценка валидации ${validationScore}/100`);
    console.log(`   - Валидация пройдена: ${validation.passed}`);
    console.log(`   - Ошибки: ${validation.errors?.length || 0}`);
    console.log(`   - Предупреждения: ${validation.warnings?.length || 0}`);
    
    sendProgress('stage3_complete', {
      stage: 3,
      message: 'Валидация завершена',
      overall_score: validationScore,
      attempt: attempt,
      timestamp: Date.now()
    });
    
    // ========================================
    // ПРОВЕРКА: Нужна ли ЭСКАЛАЦИЯ?
    // ========================================
    const escalationThreshold = config.validation_settings?.escalation_threshold || 70;
    
    if (validationScore < escalationThreshold && attempt < maxAttempts) {
      // ПОПЫТКА 2: DeepSeek Reasoner (умная модель)
      attempt = 2;
      modelUsed = 'deepseek-reasoner';
      
      console.log(`\n⚠️  Оценка ${validationScore}/100 < ${escalationThreshold}. Запуск ЭСКАЛАЦИИ!`);
      console.log(`🧠 ПОПЫТКА 2/3: DeepSeek Reasoner (умная модель)\n`);
      
      sendProgress('stage2_retry', {
        stage: 2,
        message: `🧠 Повторная обработка через DeepSeek Reasoner`,
        attempt: attempt,
        model: modelUsed,
        reason: `Первая попытка дала оценку ${validationScore}/100`,
        timestamp: Date.now()
      });
      
      // Stage 2: DeepSeek Reasoner
      const stage2ConfigReasoner = { ...config, deepseek_model: modelUsed };
      equivalents = await stage2Process.execute(standardCode, standardType, searchData, stage2ConfigReasoner);
      
      console.log(`✅ Этап 2 (попытка ${attempt}) завершен: обработка через ${modelUsed}`);
      
      sendProgress('stage2_complete', {
        stage: 2,
        message: 'Обработка данных завершена',
        model: modelUsed,
        attempt: attempt,
        timestamp: Date.now()
      });
      
      // Stage 3: Валидация
      sendProgress('stage3_start', {
        stage: 3,
        message: 'Повторная валидация через OpenAI...',
        attempt: attempt,
        timestamp: Date.now()
      });
      
      validation = await stage3Validate.execute(standardCode, equivalents, config);
      const validationScore2 = validation.overall_score;
      
      console.log(`✅ Этап 3 (попытка ${attempt}) завершен: оценка ${validationScore2}/100`);
      
      sendProgress('stage3_complete', {
        stage: 3,
        message: 'Валидация завершена',
        overall_score: validationScore2,
        attempt: attempt,
        timestamp: Date.now()
      });
      
      // ========================================
      // ПОПЫТКА 3: OpenAI GPT-4o-mini (если все еще < threshold)
      // ========================================
      if (validationScore2 < escalationThreshold && attempt < maxAttempts) {
        attempt = 3;
        modelUsed = 'gpt-4o-mini';
        
        console.log(`\n⚠️  Оценка ${validationScore2}/100 < ${escalationThreshold}. Финальная ЭСКАЛАЦИЯ!`);
        console.log(`🚀 ПОПЫТКА 3/3: OpenAI GPT-4o-mini (максимальная надежность)\n`);
        
        sendProgress('stage2_retry', {
          stage: 2,
          message: `🚀 Финальная обработка через GPT-4o-mini`,
          attempt: attempt,
          model: modelUsed,
          reason: `DeepSeek Reasoner дал оценку ${validationScore2}/100`,
          timestamp: Date.now()
        });
        
        // Stage 2: OpenAI
        equivalents = await stage2ProcessOpenAI.execute(standardCode, standardType, searchData, config);
        
        console.log(`✅ Этап 2 (попытка ${attempt}) завершен: обработка через ${modelUsed}`);
        
        sendProgress('stage2_complete', {
          stage: 2,
          message: 'Обработка данных завершена',
          model: modelUsed,
          attempt: attempt,
          timestamp: Date.now()
        });
        
        // Stage 3: Валидация
        sendProgress('stage3_start', {
          stage: 3,
          message: 'Финальная валидация через OpenAI...',
          attempt: attempt,
          timestamp: Date.now()
        });
        
        validation = await stage3Validate.execute(standardCode, equivalents, config);
        const validationScore3 = validation.overall_score;
        
        console.log(`✅ Этап 3 (попытка ${attempt}) завершен: оценка ${validationScore3}/100`);
        console.log(`🎯 Финальный результат: ${modelUsed} на попытке ${attempt}`);
        
        sendProgress('stage3_complete', {
          stage: 3,
          message: 'Валидация завершена',
          overall_score: validationScore3,
          attempt: attempt,
          timestamp: Date.now()
        });
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ ИТОГО: Использована модель ${modelUsed} на попытке ${attempt}/3`);
    console.log(`   Финальный балл: ${validation.overall_score}/100`);
    console.log(`${'='.repeat(60)}\n`);

    // Проверка минимального балла
    const finalScore = validation.overall_score;
    if (finalScore < config.validation_settings.min_overall_score) {
      console.error(`❌ Валидация не пройдена: балл ${finalScore} < ${config.validation_settings.min_overall_score}`);
      throw new Error(`Валидация не пройдена: балл ${finalScore} ниже минимального ${config.validation_settings.min_overall_score}. Попробуйте другой стандарт или проверьте данные.`);
    }

    // Формирование финального результата
    const finalResult = {
      input_standard: standardCode,
      standard_type: standardType || 'general',
      equivalents: equivalents.equivalents || equivalents,
      compatibility_assessment: equivalents.compatibility_assessment || {},
      validation: validation,
      sources_count: searchData.sources_count,
      processing_info: {
        attempts: attempt,
        model_used: modelUsed,
        final_score: finalScore,
        escalation_triggered: attempt > 1
      },
      processing_time: {
        stage1: 0, // Будет заполнено на клиенте
        stage2: 0,
        stage3: 0,
        total: 0
      },
      cached: false,
      config_used: {
        version: config.version,
        strictness: config.validation_settings.strictness,
        min_score: config.validation_settings.min_overall_score
      }
    };

    // Кэширование (только после успешной валидации)
    if (config.cache_settings.enabled && config.cache_settings.cache_after_validation_only) {
      await cacheResults(standardCode, finalResult, config);
    }

    return finalResult;

  } catch (error) {
    console.error('[StandardsEngine] Ошибка:', error);
    sendProgress('error', {
      message: error.message,
      timestamp: Date.now()
    });
    throw error;
  }
}

/**
 * Кэширование результатов
 */
async function cacheResults(standardCode, result, config) {
  const cacheData = {
    ...result,
    cached_at: new Date().toISOString(),
    config_version: config.version
  };

  cacheManager.saveStandards(standardCode, cacheData);
  console.log('💾 Результат сохранен в кэш');
}

module.exports = {
  findEquivalents
};

