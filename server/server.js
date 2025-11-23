const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const searchEngine = require('./searchEngine');
const standardsEngine = require('./standardsEngine');
const configManager = require('./config');
const cacheManager = require('./cacheManager');
const tavilyClient = require('./clients/tavilyClient');
const deepseekClient = require('./clients/deepseekClient');
const openaiClient = require('./clients/openaiClient');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes

// 1. Поиск аналогов (трёхэтапный процесс) с SSE для обновлений прогресса
app.post('/api/search', async (req, res) => {
  try {
    const { steel_grade } = req.body;

    if (!steel_grade) {
      return res.status(400).json({
        status: 'error',
        message: 'Требуется указать марку стали'
      });
    }

    console.log(`[API] Запуск 3-этапного поиска для: ${steel_grade}`);

    // Настройка SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Отключаем буферизацию для nginx

    // Функция для отправки событий
    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const config = configManager.getConfig();
    
    // Запуск поиска с callback для обновлений
    searchEngine.findSteelAnalogs(steel_grade, config, sendEvent)
      .then(result => {
        sendEvent('complete', result);
        res.end();
      })
      .catch(error => {
        console.error('[API] Ошибка поиска:', error);
        sendEvent('error', { message: error.message });
        res.end();
      });

  } catch (error) {
    console.error('[API] Ошибка поиска:', error);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
});

// 2. Получить конфигурацию
app.get('/api/config', (req, res) => {
  const config = configManager.getConfig();
  res.json(config);
});

// 3. Обновить конфигурацию
app.post('/api/config', (req, res) => {
  try {
    configManager.updateConfig(req.body);
    res.json({
      status: 'success',
      message: 'Конфигурация обновлена'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 4. Очистить кэш
app.delete('/api/cache', (req, res) => {
  try {
    cacheManager.clear();
    res.json({
      status: 'success',
      message: 'Кэш очищен'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 5. Получить запись из кэша
app.get('/api/cache/:steel_grade', (req, res) => {
  const { steel_grade } = req.params;
  const cached = cacheManager.get(steel_grade);

  if (cached) {
    res.json({
      cached: true,
      data: cached
    });
  } else {
    res.json({
      cached: false,
      message: 'Не найдено в кэше'
    });
  }
});

// 6. Получить промпты для просмотра (стали)
app.get('/api/prompts', (req, res) => {
  try {
    const promptBuilder = require('./promptBuilder');
    
    // Создаем пример данных для промптов
    const exampleSearchData = {
      sources_count: 45,
      aggregated_data: {
        top_sources: [
          { title: 'Пример источника', content: 'Пример содержимого...' }
        ]
      }
    };
    
    const exampleProcessedData = {
      analogs: {
        USA: { grade: 'AISI 304', chemical_composition: { C: '0.08', Ti: '0' } },
        Russia: { grade: '08Х18Н10', chemical_composition: { C: '0.08', Ti: '0' } },
        China: { grade: '0Cr18Ni9', chemical_composition: { C: '0.08', Ti: '0' } }
      }
    };
    
    const config = configManager.getConfig();
    
    const stage2Prompt = promptBuilder.buildStage2Prompt('AISI 304', exampleSearchData, config);
    const stage3Prompt = promptBuilder.buildStage3Prompt('AISI 304', exampleProcessedData, exampleSearchData, config);
    
    res.json({
      stage2: stage2Prompt,
      stage3: stage3Prompt
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 7. Проверить балансы всех API
app.get('/api/balance', async (req, res) => {
  try {
    const balances = {
      tavily: null,
      deepseek: null,
      openai: null
    };

    // Проверяем баланс Tavily
    try {
      balances.tavily = await tavilyClient.checkBalance();
    } catch (error) {
      balances.tavily = {
        success: false,
        message: `Ошибка проверки баланса Tavily: ${error.message}`,
        error: error.message
      };
    }

    // Проверяем баланс DeepSeek
    try {
      balances.deepseek = await deepseekClient.checkBalance();
    } catch (error) {
      balances.deepseek = {
        success: false,
        message: `Ошибка проверки баланса DeepSeek: ${error.message}`,
        error: error.message
      };
    }

    // Проверяем баланс OpenAI
    try {
      balances.openai = await openaiClient.checkBalance();
    } catch (error) {
      balances.openai = {
        success: false,
        message: `Ошибка проверки баланса OpenAI: ${error.message}`,
        error: error.message
      };
    }

    res.json({
      status: 'success',
      balances,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ========================================
// API Routes для стандартов
// ========================================

// 1. Поиск эквивалентов стандартов (трёхэтапный процесс) с SSE
app.post('/api/standards/search', async (req, res) => {
  try {
    const { standard_code, standard_type } = req.body;

    if (!standard_code) {
      return res.status(400).json({
        status: 'error',
        message: 'Требуется указать код стандарта'
      });
    }

    console.log(`[API Standards] Запуск 3-этапного поиска для: ${standard_code}`);

    // Настройка SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Функция для отправки событий
    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Запуск поиска с callback для обновлений
    standardsEngine.findEquivalents(standard_code, standard_type, sendEvent)
      .then(result => {
        sendEvent('complete', result);
        res.end();
      })
      .catch(error => {
        console.error('[API Standards] Ошибка поиска:', error);
        sendEvent('error', { message: error.message });
        res.end();
      });

  } catch (error) {
    console.error('[API Standards] Ошибка поиска:', error);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
});

// 2. Получить настройки стандартов
app.get('/api/standards/settings', (req, res) => {
  try {
    const config = configManager.getStandardsConfig();
    if (!config) {
      return res.status(404).json({
        status: 'error',
        message: 'Конфигурация стандартов не найдена'
      });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 3. Обновить настройки стандартов
app.post('/api/standards/settings', (req, res) => {
  try {
    configManager.updateStandardsConfig(req.body);
    res.json({
      status: 'success',
      message: 'Настройки стандартов обновлены'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 4. Сбросить настройки стандартов
app.post('/api/standards/settings/reset', (req, res) => {
  try {
    // Загружаем конфигурацию по умолчанию из файла
    const fs = require('fs');
    const path = require('path');
    const defaultConfigPath = path.join(__dirname, '../data/standards_config.json');
    
    if (fs.existsSync(defaultConfigPath)) {
      const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
      // Сбрасываем last_updated
      defaultConfig.last_updated = new Date().toISOString();
      configManager.saveStandardsConfig(defaultConfig);
      res.json({
        status: 'success',
        message: 'Настройки стандартов сброшены к умолчаниям'
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'Файл конфигурации по умолчанию не найден'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 5. Очистить кэш стандартов
app.delete('/api/standards/cache', (req, res) => {
  try {
    cacheManager.clearStandards();
    res.json({
      status: 'success',
      message: 'Кэш стандартов очищен'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 6. Получить информацию о кэше стандартов
app.get('/api/standards/cache/info', (req, res) => {
  try {
    const cache = cacheManager.loadStandardsCache();
    const count = Object.keys(cache).length;
    const sizeBytes = JSON.stringify(cache).length;
    const sizeMB = sizeBytes / (1024 * 1024);
    
    res.json({
      count,
      size_bytes: sizeBytes,
      size_mb: sizeMB
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 7. Получить промпты для стандартов
app.get('/api/standards/prompts', async (req, res) => {
  try {
    const promptBuilder = require('./promptBuilder');
    const config = configManager.getStandardsConfig();
    
    if (!config) {
      return res.status(404).json({
        status: 'error',
        message: 'Конфигурация стандартов не найдена'
      });
    }
    
    // Создаем пример данных для промптов
    const exampleSearchData = {
      sources_count: 45,
      aggregated_data: {
        top_sources: [
          { title: 'Пример источника', content: 'Пример содержимого...' }
        ]
      }
    };
    
    const exampleEquivalents = {
      equivalents: {
        Russia: { standard_code: 'ГОСТ XXX-XX' },
        China: { standard_code: 'GB/T XXX-XXXX' },
        Europe: { standard_code: 'EN XXX' }
      }
    };
    
    const stage2Prompt = await promptBuilder.buildStandardsStage2Prompt(
      exampleSearchData,
      'ГОСТ 12821-80',
      'flanges',
      config
    );
    
    const stage3Prompt = await promptBuilder.buildStandardsStage3Prompt(
      exampleEquivalents,
      'ГОСТ 12821-80',
      config
    );
    
    res.json({
      stage2: stage2Prompt,
      stage3: stage3Prompt
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 API доступно на http://localhost:${PORT}/api`);
  console.log(`🔧 3-этапный конвейер: Tavily → DeepSeek → OpenAI`);
  console.log(`📋 API стандартов: /api/standards/*`);
});

