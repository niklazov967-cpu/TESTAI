/**
 * translator.js - Переводчик текстов через DeepSeek API
 */

const deepseekClient = require('./clients/deepseekClient');

/**
 * Определяет, является ли текст на русском языке
 */
function isRussian(text) {
    if (!text || typeof text !== 'string') return false;
    
    // Проверка на наличие кириллицы
    const cyrillicPattern = /[А-Яа-яЁё]/;
    return cyrillicPattern.test(text);
}

/**
 * Переводит текст на русский язык через DeepSeek
 */
async function translateToRussian(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return text;
    }
    
    // Если уже на русском, возвращаем как есть
    if (isRussian(text)) {
        return text;
    }
    
    try {
        console.log(`[Translator] Перевод текста: ${text.substring(0, 50)}...`);
        
        const axios = require('axios');
        const apiKey = process.env.DEEPSEEK_API_KEY;
        
        if (!apiKey) {
            console.warn('[Translator] DEEPSEEK_API_KEY не установлен, пропускаем перевод');
            return text;
        }
        
        const prompt = `Переведи следующий текст на русский язык. Переведи только текст, без дополнительных комментариев и без JSON обертки.

Текст для перевода:
${text}

Перевод:`;
        
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        const content = response.data.choices[0].message.content.trim();
        
        // Очищаем от возможных JSON оберток
        let translated = content;
        if (content.startsWith('{')) {
            try {
                const parsed = JSON.parse(content);
                translated = parsed.translation || parsed.text || parsed.content || content;
            } catch (e) {
                // Не JSON, используем как есть
            }
        }
        
        // Убираем кавычки если есть
        translated = translated.replace(/^["']|["']$/g, '');
        
        console.log(`[Translator] Перевод завершен`);
        return translated;
        
    } catch (error) {
        console.error('[Translator] Ошибка перевода:', error.message);
        // В случае ошибки возвращаем оригинальный текст
        return text;
    }
}

/**
 * Переводит объект рекурсивно, переводя все строковые значения на русский
 */
async function translateObject(obj) {
    if (!obj) return obj;
    
    if (typeof obj === 'string') {
        return await translateToRussian(obj);
    }
    
    if (Array.isArray(obj)) {
        const translated = [];
        for (const item of obj) {
            translated.push(await translateObject(item));
        }
        return translated;
    }
    
    if (typeof obj === 'object') {
        const translated = {};
        for (const [key, value] of Object.entries(obj)) {
            // Не переводим технические поля
            if (key === 'grade' || key === 'standard' || key === 'steel_class' || 
                key === 'weldability' || key === 'popularity' || 
                key === 'chemical_composition' || key === 'mechanical_properties' ||
                key === 'carbon_equivalent' || key === 'steel_input' ||
                key === 'status' || key === 'cached' || key === 'timestamp' ||
                key === 'pipeline' || key === 'overall_score' || key === 'criteria_scores' ||
                key === 'passed' || key === 'checks_performed' || key === 'iterations_used') {
                // Для некоторых полей переводим только значения
                if (key === 'weldability' || key === 'popularity' || key === 'steel_class') {
                    translated[key] = await translateToRussian(value);
                } else {
                    translated[key] = await translateObject(value);
                }
            } else {
                translated[key] = await translateObject(value);
            }
        }
        return translated;
    }
    
    return obj;
}

/**
 * Переводит результаты валидации на русский
 */
async function translateValidation(validation) {
    if (!validation) return validation;
    
    const translated = { ...validation };
    
    // Переводим ошибки, предупреждения и рекомендации
    if (validation.errors && Array.isArray(validation.errors)) {
        translated.errors = [];
        for (const error of validation.errors) {
            translated.errors.push(await translateToRussian(error));
        }
    }
    
    if (validation.warnings && Array.isArray(validation.warnings)) {
        translated.warnings = [];
        for (const warning of validation.warnings) {
            translated.warnings.push(await translateToRussian(warning));
        }
    }
    
    if (validation.recommendations && Array.isArray(validation.recommendations)) {
        translated.recommendations = [];
        for (const recommendation of validation.recommendations) {
            translated.recommendations.push(await translateToRussian(recommendation));
        }
    }
    
    return translated;
}

module.exports = {
    translateToRussian,
    translateObject,
    translateValidation,
    isRussian
};

