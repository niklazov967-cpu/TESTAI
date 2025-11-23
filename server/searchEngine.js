const cacheManager = require('./cacheManager');
const stage1Search = require('./stages/stage1_search');
const stage2Process = require('./stages/stage2_process');
const stage2SequentialSearch = require('./stages/stage2_sequential_search');
const stage2SeparatePrompts = require('./stages/stage2_separate_prompts');
const stage3SeparateValidation = require('./stages/stage3_separate_validation');
const stage2ProcessOpenAI = require('./stages/stage2_process_openai');
const stage3Validate = require('./stages/stage3_validate');
const translator = require('./translator');
const stage1TargetedSearch = require('./stages/stage1_targeted_search');
const promptBuilder = require('./promptBuilder');
const deepseekClient = require('./clients/deepseekClient');

/**
 * Главная функция поиска аналогов (3-этапный конвейер)
 * @param {string} steelGrade - Марка стали
 * @param {object} config - Конфигурация
 * @param {function} progressCallback - Функция для отправки обновлений прогресса (опционально)
 */
async function findSteelAnalogs(steelGrade, config, progressCallback = null) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 Запуск 3-этапного конвейера поиска для: ${steelGrade}`);
    console.log(`${'='.repeat(60)}\n`);

  // Функция для отправки событий
  const sendProgress = (event, data) => {
    if (progressCallback) {
      progressCallback(event, data);
    }
  };

  // Проверка кэша
  if (config.cache_enabled) {
    const cached = cacheManager.get(steelGrade);
    if (cached) {
        console.log('✅ Найдено в кэше, проверяем перевод...');
      sendProgress('cached', { cached: true });
      
      // Проверяем, нужно ли перевести данные из кэша
      const needsTranslation = checkIfNeedsTranslation(cached);
      if (needsTranslation) {
        console.log('🌐 Обнаружен английский текст в кэше, переводим...');
        sendProgress('translation_start', {
          stage: 4,
          message: 'Перевод данных из кэша...',
          timestamp: Date.now()
        });
        
        try {
          let textsTranslated = 0;
          
          // Переводим валидацию (все поля, включая errors, warnings, recommendations)
          if (cached.validation) {
            const errorsCount = cached.validation.errors?.length || 0;
            const warningsCount = cached.validation.warnings?.length || 0;
            const recommendationsCount = cached.validation.recommendations?.length || 0;
            
            cached.validation = await translator.translateValidation(cached.validation);
            textsTranslated += errorsCount + warningsCount + recommendationsCount;
          }
          
          // Переводим классы стали, свариваемость, популярность
          for (const country of ['USA', 'Russia', 'China']) {
            if (cached.analogs && cached.analogs[country]) {
              const analog = cached.analogs[country];
              if (analog.steel_class && !translator.isRussian(analog.steel_class)) {
                analog.steel_class = await translator.translateToRussian(analog.steel_class);
                textsTranslated++;
              }
              if (analog.weldability && !translator.isRussian(analog.weldability)) {
                analog.weldability = await translator.translateToRussian(analog.weldability);
                textsTranslated++;
              }
              if (analog.popularity && !translator.isRussian(analog.popularity)) {
                analog.popularity = await translator.translateToRussian(analog.popularity);
                textsTranslated++;
              }
            }
          }
          
          // Проверяем, что перевод успешен перед сохранением
          const translationSuccessful = checkTranslationSuccess(cached);
          if (translationSuccessful) {
            // Сохраняем переведенную версию обратно в кэш
            cacheManager.save(steelGrade, cached);
            console.log(`✅ Перевод данных из кэша завершен (переведено ${textsTranslated} текстов)`);
            sendProgress('translation_complete', {
              stage: 4,
              message: 'Перевод завершен',
              texts_translated: textsTranslated,
              timestamp: Date.now()
            });
          } else {
            console.warn('⚠️ Перевод данных из кэша не завершен полностью');
          }
        } catch (error) {
          console.error('⚠️ Ошибка перевода данных из кэша:', error.message);
          sendProgress('translation_error', {
            stage: 4,
            message: 'Ошибка перевода данных из кэша',
            timestamp: Date.now()
          });
        }
      }
      
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
    
    const searchData = await stage1Search.execute(steelGrade, config);
    
    console.log(`✅ Этап 1 завершен: найдено ${searchData.sources_count} источников`);
    console.log(`   - Выполнено поисковых запросов: ${searchData.queries_executed}`);
    console.log(`   - Всего результатов: ${searchData.total_results}`);
    
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
    // С умной эскалацией моделей при ошибках
    // ========================================
    console.log('\n🤖 ЭТАП 2: Обработка через DeepSeek');
    console.log('─'.repeat(60));
    
    let attempt = 1;
    let processedData = null;
    let validatedData = null;
    let modelUsed = 'deepseek-chat';
    const maxAttempts = 3;
    
    // ПОПЫТКА 1: DeepSeek Chat (стандартная модель)
    console.log(`\n[Попытка ${attempt}/${maxAttempts}] 💬 DeepSeek Chat (стандартная модель)`);
    
    sendProgress('stage2_start', {
      stage: 2,
      message: 'Обработка данных через DeepSeek Chat...',
      attempt: attempt,
      timestamp: Date.now()
    });
    
    // Выбор стратегии поиска
    const searchStrategy = config.search_strategy || 'parallel';
    const useSeparatePrompts = config.use_separate_prompts !== false; // По умолчанию ВКЛ!
    
    if (useSeparatePrompts) {
      console.log('[Этап 2] 🔀 Используется стратегия: ОТДЕЛЬНЫЕ ПРОМПТЫ для каждой марки');
      processedData = await stage2SeparatePrompts.execute(steelGrade, searchData, config);
    } else if (searchStrategy === 'sequential') {
      console.log('[Этап 2] 🔄 Используется последовательная стратегия поиска');
      processedData = await stage2SequentialSearch.execute(steelGrade, searchData, config);
    } else {
      console.log('[Этап 2] 💬 Используется стандартная параллельная стратегия');
      processedData = await stage2Process.execute(steelGrade, searchData, {
        ...config,
        deepseek_model: 'deepseek-chat'
      });
    }
    console.log(`   - США: ${processedData.analogs.USA.grade}`);
    console.log(`   - Россия: ${processedData.analogs.Russia.grade}`);
    console.log(`   - Китай: ${processedData.analogs.China.grade}`);
    
    sendProgress('stage2_complete', {
      stage: 2,
      message: 'Обработка данных завершена',
      attempt: attempt,
      model: 'deepseek-chat',
      iterations: processedData.iterations_used || 1,
      analogs: {
        USA: processedData.analogs.USA.grade,
        Russia: processedData.analogs.Russia.grade,
        China: processedData.analogs.China.grade
      },
      timestamp: Date.now()
    });

    // ========================================
    // ЭТАП 3: OpenAI Validation (Валидация)
    // ========================================
    console.log('\n✅ ЭТАП 3: Валидация через OpenAI');
    console.log('─'.repeat(60));
    
    sendProgress('stage3_start', {
      stage: 3,
      message: 'Валидация результатов через OpenAI...',
      attempt: attempt,
      timestamp: Date.now()
    });
    
    validatedData = useSeparatePrompts ? await stage3SeparateValidation.execute(steelGrade, processedData, searchData, config) : await stage3Validate.execute(steelGrade, processedData, searchData, config);
    
    let validationScore = validatedData.validation.overall_score;
    console.log(`✅ Этап 3 (попытка ${attempt}) завершен: оценка валидации ${validationScore}/100`);
    console.log(`   - Валидация пройдена: ${validatedData.validation.passed}`);
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДО ЭСКАЛАЦИИ
    console.log('\n📊 МЕХАНИЧЕСКИЕ СВОЙСТВА (ДО ЭСКАЛАЦИИ):');
    console.log('  USA:', processedData.analogs.USA.mechanical_properties);
    console.log('  Russia:', processedData.analogs.Russia.mechanical_properties);
    console.log('  China:', processedData.analogs.China.mechanical_properties);
    console.log(`   - Ошибки: ${validatedData.validation.errors.length}`);
    console.log(`   - Предупреждения: ${validatedData.validation.warnings.length}`);
    
    sendProgress('stage3_complete', {
      stage: 3,
      message: 'Валидация завершена',
      attempt: attempt,
      score: validationScore,
      passed: validatedData.validation.passed,
      timestamp: Date.now()
    });

    // ========================================
    // ========================================
    // Сохраняем лучший результат для сравнения
    let bestResult = {
      data: JSON.parse(JSON.stringify(processedData)),
      validation: JSON.parse(JSON.stringify(validatedData)),
      score: validationScore,
      attempt: attempt,
      model: modelUsed
    };
    // ПРОВЕРКА: Нужна ли эскалация?
    // ========================================
    const escalationThreshold = config.escalation_threshold || 85;
    
    if (validationScore < escalationThreshold && attempt < maxAttempts) {
      // ПОПЫТКА 2: DeepSeek Reasoner с целевым дополнительным поиском
      attempt = 2;
      modelUsed = 'deepseek-reasoner';
      
      console.log(`\n⚠️ Валидация не прошла (балл: ${validationScore}/100)`);
      console.log(`\n[Попытка ${attempt}/${maxAttempts}] 🧠 DeepSeek Reasoner + целевой поиск`);
      console.log('─'.repeat(60));
      
      sendProgress('stage2_retry', {
        stage: 2,
        status: 'starting',
        message: `Целевой дополнительный поиск данных <span style="font-size: 0.85em; color: #666;">(попытка ${attempt})</span>`,
        reason: `Балл валидации ${validationScore}/100 ниже порога ${escalationThreshold}`,
        model: 'deepseek-reasoner',
        mode: 'targeted_search',
        attempt: attempt,
        timestamp: Date.now()
      });
      
      try {
        // ШАГ 1: Целевой дополнительный поиск
        console.log('\n📡 Дополнительный целевой поиск Tavily');
        console.log('─'.repeat(60));
        
        const existingUrls = searchData.aggregated_data.top_sources.map(s => s.url);
        const targetedSearchData = await stage1TargetedSearch.execute(
          steelGrade,
          validatedData.validation,
          processedData.analogs,
          existingUrls,
          config
        );
        
        console.log(`✅ Целевой поиск завершен: ${targetedSearchData.sources.length} новых источников`);
        
        sendProgress('stage1_targeted', {
          stage: 1,
          status: 'complete',
          message: `Найдено ${targetedSearchData.sources.length} дополнительных источников`,
          sources_count: targetedSearchData.sources.length,
          queries_used: targetedSearchData.queries_used,
          timestamp: Date.now()
        });
        
        // ШАГ 2: Обработка через DeepSeek Reasoner
        console.log('\n🤖 Обработка через DeepSeek Reasoner');
        console.log('─'.repeat(60));
        
        sendProgress('stage2_retry', {
          stage: 2,
          status: 'processing',
          message: `DeepSeek Reasoner анализирует данные <span style="font-size: 0.85em; color: #666;">(попытка ${attempt})</span>`,
          model: 'deepseek-reasoner',
          timestamp: Date.now()
        });
        
        // Строим специальный промпт для Reasoner
        const reasonerPrompt = promptBuilder.buildStage2ReasonerPrompt(
          steelGrade,
          processedData,
          validatedData.validation,
          targetedSearchData,
          config
        );
        
        const improvedData = await deepseekClient.processData(
          reasonerPrompt,
          'deepseek-reasoner',
          config
        );
        
        console.log('[Этап 2] DeepSeek Reasoner завершил обработку');
        if (improvedData.improvements_made) {
          console.log('Улучшения:');
          improvedData.improvements_made.forEach(imp => console.log(`  - ${imp}`));
        }
        
        sendProgress('stage2_complete', {
          stage: 2,
          message: `DeepSeek Reasoner <span style="font-size: 0.85em; color: #666;">(попытка ${attempt})</span>`,
          attempt: attempt,
          model: 'deepseek-reasoner',
          timestamp: Date.now()
        });
        
        // ШАГ 3: Повторная валидация
        console.log('\n✅ Повторная валидация');
        console.log('─'.repeat(60));
        
        sendProgress('stage3_start', {
          stage: 3,
          message: 'Повторная валидация результатов...',
          attempt: attempt,
          timestamp: Date.now()
        });
        
        validatedData = await stage3Validate.execute(
          steelGrade,
          improvedData,
          searchData,
          config
        );
        
        const validationScore2 = validatedData.validation.overall_score;
        
        console.log(`✅ Этап 3 (попытка ${attempt}) завершен: оценка ${validationScore2}/100`);
        console.log(`   Улучшение: ${validationScore}/100 → ${validationScore2}/100 (+${(validationScore2 - validationScore).toFixed(1)})`);
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ПОСЛЕ ЭСКАЛАЦИИ
    console.log('\n📊 МЕХАНИЧЕСКИЕ СВОЙСТВА (ПОСЛЕ ЭСКАЛАЦИИ):');
    console.log('  USA:', improvedData.analogs.USA.mechanical_properties);
    console.log('  Russia:', improvedData.analogs.Russia.mechanical_properties);
    console.log('  China:', improvedData.analogs.China.mechanical_properties);
    console.log('\n🔍 СРАВНЕНИЕ МАРОК:');
    console.log('  ДО:  USA=' + processedData.analogs.USA.grade + ', Russia=' + processedData.analogs.Russia.grade + ', China=' + processedData.analogs.China.grade);
    console.log('  ПОСЛЕ: USA=' + improvedData.analogs.USA.grade + ', Russia=' + improvedData.analogs.Russia.grade + ', China=' + improvedData.analogs.China.grade);
        
        sendProgress('stage3_complete', {
          stage: 3,
          status: 'success',
          message: `Валидация: ${validationScore2}/100 <span style="font-size: 0.85em; color: #666;">(было ${validationScore})</span>`,
          attempt: attempt,
          score: validationScore2,
          improvement: validationScore2 - validationScore,
          passed: validatedData.validation.passed,
          timestamp: Date.now()
        });
        
        // Обновляем балл и данные
        // Проверяем улучшился ли результат
        if (validationScore2 > bestResult.score) {
          console.log(`✅ Reasoner улучшил результат: ${bestResult.score} → ${validationScore2}`);
          bestResult = {
            data: JSON.parse(JSON.stringify(improvedData)),
            validation: JSON.parse(JSON.stringify(validatedData)),
            score: validationScore2,
            attempt: attempt,
            model: modelUsed
          };
          validationScore = validationScore2;
          processedData = improvedData;
        } else {
          console.log(`⚠️ Reasoner не улучшил результат: ${bestResult.score} ≥ ${validationScore2}`);
          console.log(`   Используем результат попытки ${bestResult.attempt} (балл: ${bestResult.score})`);
          processedData = JSON.parse(JSON.stringify(bestResult.data));
          validatedData = JSON.parse(JSON.stringify(bestResult.validation));
          validationScore = bestResult.score;
        }
        
        // Добавляем метаданные о целевом поиске
        processedData.targeted_search = {
          enabled: true,
          new_sources: targetedSearchData.sources.length,
          queries_used: targetedSearchData.queries_used,
          improvements: improvedData.improvements_made || []
        };
        
      } catch (error) {
        console.error(`❌ Ошибка целевого поиска + Reasoner:`, error.message);
        console.log(`⚠️ Используем результат первой попытки (балл: ${validationScore})`);
        // Продолжаем с первым результатом
      }
      
      // ПОПЫТКА 3: OpenAI (если все еще не хватает)
      if (validationScore < escalationThreshold && attempt < maxAttempts) {
        attempt = 3;
        modelUsed = 'gpt-4o-mini';
        
        console.log(`\n⚠️ Reasoner не помог (балл: ${validationScore}/100)`);
        console.log(`\n[Попытка ${attempt}/${maxAttempts}] 🤖 OpenAI GPT-4o-mini (запасной вариант)`);
        console.log('─'.repeat(60));
        
        sendProgress('stage2_retry', {
          stage: 2,
          message: 'Обработка через OpenAI GPT-4o-mini...',
          attempt: attempt,
          model: 'gpt-4o-mini',
          timestamp: Date.now()
        });
        
        processedData = await stage2ProcessOpenAI.execute(steelGrade, searchData, config);
        
        console.log(`✅ Этап 2 (попытка ${attempt}) завершен`);
        
        sendProgress('stage2_complete', {
          stage: 2,
          message: 'Обработка через OpenAI завершена',
          attempt: attempt,
          model: 'gpt-4o-mini',
          timestamp: Date.now()
        });
        
        // Финальная валидация
        console.log('\n✅ ЭТАП 3: Финальная валидация через OpenAI');
        console.log('─'.repeat(60));
        
        sendProgress('stage3_start', {
          stage: 3,
          message: 'Финальная валидация результатов...',
          attempt: attempt,
          timestamp: Date.now()
        });
        
        validatedData = useSeparatePrompts ? await stage3SeparateValidation.execute(steelGrade, processedData, searchData, config) : await stage3Validate.execute(steelGrade, processedData, searchData, config);
        const validationScore3 = validatedData.validation.overall_score;
        
        // Проверяем улучшился ли результат после OpenAI
        if (validationScore3 > bestResult.score) {
          console.log(`✅ OpenAI улучшил результат: ${bestResult.score} → ${validationScore3}`);
          bestResult = {
            data: JSON.parse(JSON.stringify(processedData)),
            validation: JSON.parse(JSON.stringify(validatedData)),
            score: validationScore3,
            attempt: attempt,
            model: modelUsed
          };
          validationScore = validationScore3;
        } else {
          console.log(`⚠️ OpenAI не улучшил результат: ${bestResult.score} ≥ ${validationScore3}`);
          console.log(`   Используем результат попытки ${bestResult.attempt} (балл: ${bestResult.score})`);
          // Возвращаем лучший результат
          processedData = JSON.parse(JSON.stringify(bestResult.data));
          validatedData = JSON.parse(JSON.stringify(bestResult.validation));
          validationScore = bestResult.score;
        }
        
        console.log(`✅ Этап 3 (попытка ${attempt}) завершен: оценка ${validationScore3}/100`);
        
        if (validationScore3 < 70) {
          console.error(`\n❌ Все ${maxAttempts} попытки не прошли валидацию`);
          console.error(`   Финальный балл: ${validationScore3}/100`);
        } else {
          console.log(`\n🎉 Попытка ${attempt} успешна! Балл: ${validationScore3}/100`);
        }
        
        sendProgress('stage3_complete', {
          stage: 3,
          message: validationScore3 >= 70 ? 'Финальная валидация успешна' : 'Финальная валидация не прошла',
          attempt: attempt,
          score: validationScore3,
          passed: validatedData.validation.passed,
          timestamp: Date.now()
        });
      } else if (validationScore >= 70) {
        console.log(`\n🎉 Попытка ${attempt} (Reasoner) успешна! Балл: ${validationScore}/100`);
      }
    } else if (validationScore >= 70) {
      console.log(`\n🎉 Попытка ${attempt} успешна с первого раза! Балл: ${validationScore}/100`);
    }

    // Финальный результат
    console.log(`\n🏆 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ: Попытка ${bestResult.attempt}, Модель: ${bestResult.model}, Балл: ${bestResult.score}/100`);
    console.log(`   USA: ${processedData.analogs.USA.grade}`);
    console.log(`   Russia: ${processedData.analogs.Russia.grade}`);
    console.log(`   China: ${processedData.analogs.China.grade}`);
    let finalResult = {
      status: validatedData.validation.passed ? 'success' : 'partial_success',
      steel_input: steelGrade,
      analogs: validatedData.analogs,
      validation: validatedData.validation,
      pipeline: {
        stage1_sources: searchData.sources_count,
        stage2_iterations: processedData.iterations_used || 1,
        stage2_attempts: attempt,
        stage2_model_used: modelUsed,
        stage3_checks: validatedData.validation.checks_performed || 8
      },
      cached: false,
      timestamp: new Date().toISOString()
    };

    // ========================================
    // ЭТАП 4: Перевод на русский язык
    // ========================================
    console.log('\n🌐 ЭТАП 4: Перевод результатов на русский язык');
    console.log('─'.repeat(60));
    
    sendProgress('translation_start', {
      stage: 4,
      message: 'Перевод результатов на русский язык...',
      timestamp: Date.now()
    });
    
    let textsTranslated = 0;
    try {
      // Переводим валидацию
      if (finalResult.validation) {
        const errorsCount = finalResult.validation.errors?.length || 0;
        const warningsCount = finalResult.validation.warnings?.length || 0;
        const recommendationsCount = finalResult.validation.recommendations?.length || 0;
        
        finalResult.validation = await translator.translateValidation(finalResult.validation);
        textsTranslated += errorsCount + warningsCount + recommendationsCount;
      }
      
      // Переводим классы стали, свариваемость, популярность
      for (const country of ['USA', 'Russia', 'China']) {
        if (finalResult.analogs[country]) {
          const analog = finalResult.analogs[country];
          if (analog.steel_class && !translator.isRussian(analog.steel_class)) {
            analog.steel_class = await translator.translateToRussian(analog.steel_class);
            textsTranslated++;
          }
          if (analog.weldability && !translator.isRussian(analog.weldability)) {
            analog.weldability = await translator.translateToRussian(analog.weldability);
            textsTranslated++;
          }
          if (analog.popularity && !translator.isRussian(analog.popularity)) {
            analog.popularity = await translator.translateToRussian(analog.popularity);
            textsTranslated++;
          }
        }
      }
      
      console.log(`✅ Этап 4 завершен: переведено ${textsTranslated} текстов`);
      sendProgress('translation_complete', {
        stage: 4,
        message: 'Перевод завершен',
        texts_translated: textsTranslated,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('⚠️ Ошибка перевода (продолжаем без перевода):', error.message);
      sendProgress('translation_error', {
        stage: 4,
        message: 'Ошибка перевода (продолжаем без перевода)',
        timestamp: Date.now()
      });
    }

    // Сохранение в кэш только после успешного перевода
    if (config.cache_enabled && validatedData.validation.passed) {
      // Проверяем, что перевод выполнен успешно
      const translationSuccessful = checkTranslationSuccess(finalResult);
      if (translationSuccessful) {
        cacheManager.save(steelGrade, finalResult);
        console.log('\n💾 Результат сохранен в кэш (с переводом)');
      } else {
        console.warn('\n⚠️ Перевод не завершен, результат не сохранен в кэш');
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 3-этапный конвейер завершен`);
    console.log(`${'='.repeat(60)}\n`);

    return finalResult;

  } catch (error) {
    console.error('\n❌ Ошибка конвейера:', error);
    throw error;
  }
}

/**
 * Проверяет, нужно ли перевести данные (есть ли английский текст)
 */
function checkIfNeedsTranslation(data) {
  if (!data) return false;
  
  // Проверяем валидацию
  if (data.validation) {
    const checkArray = (arr) => {
      if (!Array.isArray(arr)) return false;
      return arr.some(item => typeof item === 'string' && !translator.isRussian(item));
    };
    
    if (checkArray(data.validation.errors) || 
        checkArray(data.validation.warnings) || 
        checkArray(data.validation.recommendations)) {
      return true;
    }
  }
  
  // Проверяем аналоги
  if (data.analogs) {
    for (const country of ['USA', 'Russia', 'China']) {
      const analog = data.analogs[country];
      if (analog) {
        if (analog.steel_class && !translator.isRussian(analog.steel_class)) return true;
        if (analog.weldability && !translator.isRussian(analog.weldability)) return true;
        if (analog.popularity && !translator.isRussian(analog.popularity)) return true;
      }
    }
  }
  
  return false;
}

/**
 * Проверяет, успешно ли выполнен перевод
 */
function checkTranslationSuccess(data) {
  if (!data) return false;
  
  // Проверяем валидацию
  if (data.validation) {
    const checkArray = (arr) => {
      if (!Array.isArray(arr)) return true; // Если массива нет, считаем успешным
      return !arr.some(item => typeof item === 'string' && !translator.isRussian(item));
    };
    
    if (!checkArray(data.validation.errors) || 
        !checkArray(data.validation.warnings) || 
        !checkArray(data.validation.recommendations)) {
      return false;
    }
  }
  
  // Проверяем аналоги
  if (data.analogs) {
    for (const country of ['USA', 'Russia', 'China']) {
      const analog = data.analogs[country];
      if (analog) {
        if (analog.steel_class && !translator.isRussian(analog.steel_class)) return false;
        if (analog.weldability && !translator.isRussian(analog.weldability)) return false;
        if (analog.popularity && !translator.isRussian(analog.popularity)) return false;
      }
    }
  }
  
  return true;
}

module.exports = {
  findSteelAnalogs
};

