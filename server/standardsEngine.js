const cacheManager = require('./cacheManager');
const configManager = require('./config');
const stage1Search = require('./stages/stage1_standards_search');
const stage2Process = require('./stages/stage2_standards_process');
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
    if (cached && isCacheValid(cached, config)) {
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
    // ЭТАП 2: DeepSeek Processing (Обработка)
    // ========================================
    console.log('\n🤖 ЭТАП 2: Обработка через DeepSeek');
    console.log('─'.repeat(60));
    
    sendProgress('stage2_start', {
      stage: 2,
      message: 'Обработка данных через DeepSeek...',
      timestamp: Date.now()
    });
    
    const equivalents = await stage2Process.execute(standardCode, standardType, searchData, config);
    
    console.log(`✅ Этап 2 завершен`);
    
    sendProgress('stage2_complete', {
      stage: 2,
      message: 'Обработка данных завершена',
      timestamp: Date.now()
    });

    // ========================================
    // ЭТАП 3: OpenAI Validation (Валидация)
    // ========================================
    console.log('\n✅ ЭТАП 3: Валидация через OpenAI');
    console.log('─'.repeat(60));
    
    sendProgress('stage3_start', {
      stage: 3,
      message: 'Валидация через OpenAI...',
      timestamp: Date.now()
    });
    
    const validation = await stage3Validate.execute(standardCode, equivalents, config);
    
    console.log(`✅ Этап 3 завершен. Общий балл: ${validation.overall_score || 'N/A'}`);
    
    sendProgress('stage3_complete', {
      stage: 3,
      message: 'Валидация завершена',
      overall_score: validation.overall_score,
      timestamp: Date.now()
    });

    // Проверка минимального балла
    if (validation.overall_score < config.validation_settings.min_overall_score) {
      throw new Error(`Валидация не пройдена: балл ${validation.overall_score} ниже минимального ${config.validation_settings.min_overall_score}`);
    }

    // Формирование финального результата
    const finalResult = {
      input_standard: standardCode,
      standard_type: standardType || 'general',
      equivalents: equivalents.equivalents || equivalents,
      compatibility_assessment: equivalents.compatibility_assessment || {},
      validation: validation,
      sources_count: searchData.sources_count,
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
    config_version: config.version,
    ttl_hours: config.cache_settings.ttl_hours
  };

  cacheManager.saveStandards(standardCode, cacheData);
  console.log('💾 Результат сохранен в кэш');
}

/**
 * Проверка валидности кэша
 */
function isCacheValid(cached, config) {
  if (!cached.cached_at || !cached.ttl_hours) return false;

  const cachedTime = new Date(cached.cached_at);
  const now = new Date();
  const hoursDiff = (now - cachedTime) / (1000 * 60 * 60);

  return hoursDiff < cached.ttl_hours;
}

module.exports = {
  findEquivalents
};

