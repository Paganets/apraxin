/**
 * DATA.JS - Уровень доступа к данным (DAL)
 * 
 * Отвечает за:
 * - Подключение к Supabase PostgreSQL БД
 * - CRUD операции с павильонами, арендаторами, скидками
 * - Кэширование данных в localStorage
 * - Поиск и фильтрацию
 * - Обработку ошибок
 * - Проверку прав доступа
 */

// ============================================================
// КОНФИГУРАЦИЯ ПОДКЛЮЧЕНИЯ К SUPABASE
// ============================================================

/**
 * Конфигурация для подключения к Supabase
 * Получается из window.SupabaseConfig (инициализирован в index.html)
 * 
 * НИКОГДА не твёрдкодируй реальные ключи в JavaScript файлах!
 */
const DataConfig = {
  // Инициализируется в initData() из window.SupabaseConfig или <meta> тегов
  SUPABASE_URL: null,
  SUPABASE_ANON_KEY: null,
  
  // Таблицы БД
  TABLES: {
    PAVILIONS: 'pavilions',
    TENANTS: 'tenants'
  },
  
  // Кэширование
  CACHE_PREFIX: 'aprashka_cache_',
  CACHE_TIMEOUT: 60 * 60 * 1000 // 1 час в миллисекундах
};

/**
 * Состояние системы доступа к данным
 */
const DataState = {
  isInitialized: false,
  pavilions: [],
  tenants: [],
  lastCacheTime: null
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

/**
 * Инициализирует систему доступа к данным
 */
async function initData() {
  console.log('📊 Data: Инициализация системы доступа к данным');
  
  try {
    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ КОНФИГУРАЦИИ SUPABASE
    // ============================================================
    // Получаем ключи из window.SupabaseConfig (инициализирован в index.html)
    // или через fallback из <meta> тегов
    
    if (window.SupabaseConfig?.url && window.SupabaseConfig?.anonKey) {
      DataConfig.SUPABASE_URL = window.SupabaseConfig.url;
      DataConfig.SUPABASE_ANON_KEY = window.SupabaseConfig.anonKey;
      console.log('✅ Data: Конфигурация Supabase загружена из window.SupabaseConfig');
    } else {
      // Fallback: получаем из <meta> тегов
      const urlMeta = document.querySelector('meta[name="supabase-url"]');
      const keyMeta = document.querySelector('meta[name="supabase-anon-key"]');
      
      if (urlMeta?.content && keyMeta?.content) {
        DataConfig.SUPABASE_URL = urlMeta.content;
        DataConfig.SUPABASE_ANON_KEY = keyMeta.content;
        console.log('✅ Data: Конфигурация Supabase загружена из <meta> тегов');
      } else {
        throw new Error('Конфигурация Supabase не найдена. Проверьте наличие window.SupabaseConfig или <meta> тегов в HTML');
      }
    }
    
    // Загружаем кэшированные данные (если существуют)
    loadCacheFromStorage();
    
    DataState.isInitialized = true;
    console.log('✅ Data: Инициализация завершена');
  } catch (error) {
    console.error('❌ Data: Ошибка инициализации', error);
  }
}

// ============================================================
// РАБОТА С ПАВИЛЬОНАМИ - CRUD
// ============================================================

/**
 * Получает все павильоны из БД
 * Использует кэш если он свежий
 * 
 * @returns {Promise<Array>} Массив всех павильонов
 */
async function getAllPavilions() {
  console.log('📚 Data: Загрузка всех павильонов');
  
  try {
    // Проверяем кэш
    const cachedData = getCacheData('pavilions');
    if (cachedData) {
      console.log(`📦 Data: Используется кэшированные данные (${cachedData.length} павильонов)`);
      DataState.pavilions = cachedData;
      return cachedData;
    }
    
    // Запрос к БД если кэш отсутствует
    const response = await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.PAVILIONS}?select=*`,
      { method: 'GET' }
    );
    
    DataState.pavilions = response;
    setCacheData('pavilions', response);
    
    console.log(`✅ Data: Загружено ${response.length} павильонов`);
    return response;
    
  } catch (error) {
    console.error('❌ Data: Ошибка при загрузке павильонов', error);
    // Возвращаем закэшированные данные при ошибке
    return DataState.pavilions;
  }
}

/**
 * Получает павильон по ID
 * 
 * @param {string} id - ID павильона
 * @returns {Promise<Object>} Объект павильона или null
 */
async function getPavilionById(id) {
  console.log(`🔍 Data: Получение павильона ${id}`);
  
  try {
    // Проверяем локальный кэш первым
    let pavilion = DataState.pavilions.find(p => p.id === id);
    if (pavilion) {
      return pavilion;
    }
    
    // Запрос к БД
    const response = await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.PAVILIONS}?id=eq.${id}&select=*`,
      { method: 'GET' }
    );
    
    if (response && response.length > 0) {
      console.log(`✅ Data: Павильон найден - ${response[0].name}`);
      return response[0];
    }
    
    console.warn(`⚠️ Data: Павильон ${id} не найден`);
    return null;
    
  } catch (error) {
    console.error('❌ Data: Ошибка при получении павильона', error);
    return null;
  }
}

/**
 * Создаёт новый павильон (только для авторизованного арендатора)
 * 
 * @param {Object} data - Данные павильона
 * @returns {Promise<Object>} Созданный павильон
 */
async function createPavilion(data) {
  console.log('➕ Data: Создание нового павильона');
  console.log('📦 Data: Полученные данные:', data);
  
  try {
    // Проверяем авторизацию
    const currentTenant = window.Auth?.getCurrentTenant?.();
    if (!currentTenant) {
      throw new Error('Требуется авторизация для создания павильона');
    }
    
    console.log('👤 Data: Текущий пользователь:', currentTenant);
    
    // Подготавливаем данные
    const pavilionData = {
      ...data,
      tenant_id: currentTenant.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log('📝 Data: Данные для отправки в БД:', pavilionData);
    
    // Отправляем в БД
    const response = await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.PAVILIONS}`,
      {
        method: 'POST',
        body: JSON.stringify(pavilionData)
      }
    );
    
    // Обновляем локальный кэш
    if (response && response[0]) {
      DataState.pavilions.push(response[0]);
      clearCacheData('pavilions');
      console.log(`✅ Data: Павильон создан - ${response[0].name}`);
      return response[0];
    }
    
    throw new Error('Ошибка при создании павильона');
    
  } catch (error) {
    console.error('❌ Data: Ошибка при создании павильона', error);
    throw error;
  }
}

/**
 * Обновляет павильон (только владелец может редактировать)
 * 
 * @param {string} id - ID павильона
 * @param {Object} data - Новые данные
 * @returns {Promise<Object>} Обновлённый павильон
 */
async function updatePavilion(id, data) {
  console.log(`✏️ Data: Обновление павильона ${id}`);
  
  try {
    // Проверяем авторизацию
    const currentTenant = window.Auth?.getCurrentTenant?.();
    if (!currentTenant) {
      throw new Error('Требуется авторизация для обновления павильона');
    }
    
    // Получаем павильон для проверки владельца
    const pavilion = await getPavilionById(id);
    if (!pavilion) {
      throw new Error('Павильон не найден');
    }
    
    // Проверяем, что это владелец павильона
    if (pavilion.tenant_id !== currentTenant.id) {
      throw new Error('Нет прав для редактирования этого павильона');
    }
    
    // Подготавливаем данные
    const updateData = {
      ...data,
      updated_at: new Date().toISOString()
    };
    
    // Отправляем обновление
    const response = await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.PAVILIONS}?id=eq.${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updateData)
      }
    );
    
    // Обновляем локальный кэш
    if (response && response[0]) {
      const index = DataState.pavilions.findIndex(p => p.id === id);
      if (index !== -1) {
        DataState.pavilions[index] = response[0];
      }
      clearCacheData('pavilions');
      console.log(`✅ Data: Павильон обновлён`);
      return response[0];
    }
    
    throw new Error('Ошибка при обновлении павильона');
    
  } catch (error) {
    console.error('❌ Data: Ошибка при обновлении павильона', error);
    throw error;
  }
}

/**
 * Удаляет павильон (только владелец может удалить)
 * 
 * @param {string} id - ID павильона
 * @returns {Promise<boolean>} true если успешно удалён
 */
async function deletePavilion(id) {
  console.log(`🗑️ Data: Удаление павильона ${id}`);
  
  try {
    // Проверяем авторизацию
    const currentTenant = window.Auth?.getCurrentTenant?.();
    if (!currentTenant) {
      throw new Error('Требуется авторизация для удаления павильона');
    }
    
    // Получаем павильон для проверки владельца
    const pavilion = await getPavilionById(id);
    if (!pavilion) {
      throw new Error('Павильон не найден');
    }
    
    // Проверяем права
    if (pavilion.tenant_id !== currentTenant.id) {
      throw new Error('Нет прав для удаления этого павильона');
    }
    
    // Удаляем из БД
    await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.PAVILIONS}?id=eq.${id}`,
      { method: 'DELETE' }
    );
    
    // Обновляем локальный кэш
    DataState.pavilions = DataState.pavilions.filter(p => p.id !== id);
    clearCacheData('pavilions');
    
    console.log(`✅ Data: Павильон удалён`);
    return true;
    
  } catch (error) {
    console.error('❌ Data: Ошибка при удалении павильона', error);
    throw error;
  }
}

// ============================================================
// РАБОТА С АРЕНДАТОРАМИ
// ============================================================

/**
 * Получает всех арендаторов (для админки)
 * 
 * @returns {Promise<Array>} Массив арендаторов
 */
async function getAllTenants() {
  console.log('👥 Data: Загрузка всех арендаторов');
  
  try {
    // Проверяем кэш
    const cachedData = getCacheData('tenants');
    if (cachedData) {
      console.log(`📦 Data: Используется кэшированные данные (${cachedData.length} арендаторов)`);
      DataState.tenants = cachedData;
      return cachedData;
    }
    
    // Запрос к БД
    const response = await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.TENANTS}?select=id,name,phone,email,approved,created_at`,
      { method: 'GET' }
    );
    
    DataState.tenants = response;
    setCacheData('tenants', response);
    
    console.log(`✅ Data: Загружено ${response.length} арендаторов`);
    return response;
    
  } catch (error) {
    console.error('❌ Data: Ошибка при загрузке арендаторов', error);
    return DataState.tenants;
  }
}

/**
 * Получает арендатора по номеру телефона
 * 
 * @param {string} phone - Номер телефона
 * @returns {Promise<Object>} Объект арендатора или null
 */
async function getTenantByPhone(phone) {
  console.log(`🔍 Data: Получение арендатора ${phone}`);
  
  try {
    const response = await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.TENANTS}?phone=eq.${phone}&select=*`,
      { method: 'GET' }
    );
    
    if (response && response.length > 0) {
      console.log(`✅ Data: Арендатор найден - ${response[0].name}`);
      return response[0];
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Data: Ошибка при получении арендатора', error);
    return null;
  }
}

/**
 * Получает арендатора по ID
 * 
 * @param {string} id - ID арендатора
 * @returns {Promise<Object>} Объект арендатора или null
 */
async function getTenantById(id) {
  console.log(`🔍 Data: Получение арендатора ${id}`);
  
  try {
    // Проверяем локальный кэш
    let tenant = DataState.tenants.find(t => t.id === id);
    if (tenant) {
      return tenant;
    }
    
    // Запрос к БД
    const response = await supabaseRequest(
      `/rest/v1/${DataConfig.TABLES.TENANTS}?id=eq.${id}&select=*`,
      { method: 'GET' }
    );
    
    if (response && response.length > 0) {
      return response[0];
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Data: Ошибка при получении арендатора', error);
    return null;
  }
}

// ============================================================
// РАБОТА СО СКИДКАМИ
// ============================================================

/**
 * Добавляет скидку к павильону
 * 
 * @param {string} pavilionId - ID павильона
 * @param {Object} discountData - Данные скидки (title, description, percentage и т.д.)
 * @returns {Promise<Object>} Обновлённый павильон
 */
async function addDiscount(pavilionId, discountData) {
  console.log(`💰 Data: Добавление скидки к павильону ${pavilionId}`);
  
  try {
    // Проверяем авторизацию и права
    const currentTenant = window.Auth?.getCurrentTenant?.();
    if (!currentTenant) {
      throw new Error('Требуется авторизация');
    }
    
    // Получаем павильон
    const pavilion = await getPavilionById(pavilionId);
    if (!pavilion) {
      throw new Error('Павильон не найден');
    }
    
    // Проверяем права владельца
    if (pavilion.tenant_id !== currentTenant.id) {
      throw new Error('Нет прав для добавления скидки');
    }
    
    // Подготавливаем массив скидок
    let discounts = pavilion.discounts || [];
    if (!Array.isArray(discounts)) {
      discounts = [];
    }
    
    // Добавляем новую скидку
    const newDiscount = {
      id: generateId(),
      ...discountData,
      created_at: new Date().toISOString()
    };
    
    discounts.push(newDiscount);
    
    // Обновляем павильон
    return await updatePavilion(pavilionId, { discounts });
    
  } catch (error) {
    console.error('❌ Data: Ошибка при добавлении скидки', error);
    throw error;
  }
}

/**
 * Удаляет скидку от павильона
 * 
 * @param {string} pavilionId - ID павильона
 * @param {string} discountId - ID скидки
 * @returns {Promise<Object>} Обновлённый павильон
 */
async function removeDiscount(pavilionId, discountId) {
  console.log(`🗑️ Data: Удаление скидки ${discountId}`);
  
  try {
    // Проверяем права
    const currentTenant = window.Auth?.getCurrentTenant?.();
    if (!currentTenant) {
      throw new Error('Требуется авторизация');
    }
    
    // Получаем павильон
    const pavilion = await getPavilionById(pavilionId);
    if (!pavilion) {
      throw new Error('Павильон не найден');
    }
    
    if (pavilion.tenant_id !== currentTenant.id) {
      throw new Error('Нет прав для удаления скидки');
    }
    
    // Удаляем скидку
    const discounts = (pavilion.discounts || []).filter(d => d.id !== discountId);
    
    return await updatePavilion(pavilionId, { discounts });
    
  } catch (error) {
    console.error('❌ Data: Ошибка при удалении скидки', error);
    throw error;
  }
}

/**
 * Обновляет скидку
 * 
 * @param {string} pavilionId - ID павильона
 * @param {string} discountId - ID скидки
 * @param {Object} data - Новые данные скидки
 * @returns {Promise<Object>} Обновлённый павильон
 */
async function updateDiscount(pavilionId, discountId, data) {
  console.log(`✏️ Data: Обновление скидки ${discountId}`);
  
  try {
    // Проверяем права
    const currentTenant = window.Auth?.getCurrentTenant?.();
    if (!currentTenant) {
      throw new Error('Требуется авторизация');
    }
    
    // Получаем павильон
    const pavilion = await getPavilionById(pavilionId);
    if (!pavilion) {
      throw new Error('Павильон не найден');
    }
    
    if (pavilion.tenant_id !== currentTenant.id) {
      throw new Error('Нет прав для обновления скидки');
    }
    
    // Обновляем скидку
    const discounts = (pavilion.discounts || []).map(d => {
      if (d.id === discountId) {
        return {
          ...d,
          ...data,
          updated_at: new Date().toISOString()
        };
      }
      return d;
    });
    
    return await updatePavilion(pavilionId, { discounts });
    
  } catch (error) {
    console.error('❌ Data: Ошибка при обновлении скидки', error);
    throw error;
  }
}

// ============================================================
// ПОИСК И ФИЛЬТРАЦИЯ
// ============================================================

/**
 * Ищет павильоны по названию или категории
 * 
 * @param {string} query - Поисковый запрос
 * @returns {Promise<Array>} Массив найденных павильонов
 */
async function searchPavilions(query) {
  console.log(`🔎 Data: Поиск павильонов: "${query}"`);
  
  try {
    if (!query || query.trim().length === 0) {
      return DataState.pavilions;
    }
    
    const lowerQuery = query.toLowerCase();
    
    const results = DataState.pavilions.filter(pavilion => {
      const name = (pavilion.name || '').toLowerCase();
      const category = (pavilion.category || '').toLowerCase();
      const tenantName = (pavilion.tenant_name || '').toLowerCase();
      
      return name.includes(lowerQuery) || 
             category.includes(lowerQuery) || 
             tenantName.includes(lowerQuery);
    });
    
    console.log(`✅ Data: Найдено ${results.length} павильонов`);
    return results;
    
  } catch (error) {
    console.error('❌ Data: Ошибка при поиске', error);
    return [];
  }
}

/**
 * Фильтрует павильоны по категории
 * 
 * @param {string} category - Категория
 * @returns {Array} Отфильтрованные павильоны
 */
function filterByCategory(category) {
  console.log(`🏷️ Data: Фильтр по категории: ${category}`);
  
  if (!category) {
    return DataState.pavilions;
  }
  
  const results = DataState.pavilions.filter(p => p.category === category);
  console.log(`✅ Data: Найдено ${results.length} павильонов в категории`);
  return results;
}

/**
 * Получает все павильоны конкретного арендатора
 * 
 * @param {string} tenantId - ID арендатора
 * @returns {Array} Павильоны арендатора
 */
function getPavilionsByTenant(tenantId) {
  console.log(`📍 Data: Получение павильонов арендатора ${tenantId}`);
  
  if (!tenantId) {
    return [];
  }
  
  const results = DataState.pavilions.filter(p => p.tenant_id === tenantId);
  return results;
}

// ============================================================
// КЭШИРОВАНИЕ
// ============================================================

/**
 * Получает данные из кэша localStorage
 * 
 * @param {string} key - Ключ кэша
 * @returns {any} Кэшированные данные или null
 */
function getCacheData(key) {
  try {
    const cacheKey = `${DataConfig.CACHE_PREFIX}${key}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const data = JSON.parse(cached);
    
    // Проверяем время кэша
    if (data.timestamp && Date.now() - data.timestamp > DataConfig.CACHE_TIMEOUT) {
      console.log(`📦 Data: Кэш истёк для "${key}"`);
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return data.value;
  } catch (error) {
    console.error(`❌ Data: Ошибка при чтении кэша "${key}"`, error);
    return null;
  }
}

/**
 * Сохраняет данные в кэш localStorage
 * 
 * @param {string} key - Ключ кэша
 * @param {any} value - Значение для кэша
 */
function setCacheData(key, value) {
  try {
    const cacheKey = `${DataConfig.CACHE_PREFIX}${key}`;
    const data = {
      value,
      timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (error) {
    console.error(`❌ Data: Ошибка при сохранении кэша "${key}"`, error);
  }
}

/**
 * Очищает кэш для конкретного ключа
 * 
 * @param {string} key - Ключ кэша
 */
function clearCacheData(key) {
  try {
    const cacheKey = `${DataConfig.CACHE_PREFIX}${key}`;
    localStorage.removeItem(cacheKey);
    console.log(`🗑️ Data: Кэш очищен для "${key}"`);
  } catch (error) {
    console.error(`❌ Data: Ошибка при очистке кэша "${key}"`, error);
  }
}

/**
 * Загружает кэш из localStorage при инициализации
 */
function loadCacheFromStorage() {
  try {
    DataState.pavilions = getCacheData('pavilions') || [];
    DataState.tenants = getCacheData('tenants') || [];
  } catch (error) {
    console.error('❌ Data: Ошибка при загрузке кэша', error);
  }
}

/**
 * Полностью очищает весь кэш
 */
function clearAllCache() {
  console.log('🗑️ Data: Полная очистка кэша');
  
  try {
    const keys = ['pavilions', 'tenants'];
    keys.forEach(key => clearCacheData(key));
    DataState.pavilions = [];
    DataState.tenants = [];
    console.log('✅ Data: Кэш полностью очищен');
  } catch (error) {
    console.error('❌ Data: Ошибка при очистке кэша', error);
  }
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Выполняет HTTP запрос к Supabase REST API
 * 
 * @param {string} endpoint - API endpoint (например /rest/v1/pavilions)
 * @param {Object} options - Опции запроса
 * @returns {Promise<any>} Результат запроса
 */
async function supabaseRequest(endpoint, options = {}) {
  const url = `${DataConfig.SUPABASE_URL}${endpoint}`;
  const headers = {
    'apikey': DataConfig.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorData}`);
    }
    
    // Для DELETE запросов нет тела ответа
    if (options.method === 'DELETE') {
      return null;
    }
    
    return await response.json();
    
  } catch (error) {
    console.error(`❌ Data: Ошибка Supabase запроса`, error);
    throw error;
  }
}

/**
 * Генерирует уникальный ID
 * 
 * @returns {string} Уникальный ID
 */
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Получает текущего пользователя (из Auth модуля)
 * 
 * @returns {Promise<Object>} Объект текущего пользователя
 */
function getCurrentUser() {
  return window.Auth?.getCurrentTenant?.() || null;
}

/**
 * Alias для updatePavilion (совместимость с admin.js)
 * Принимает либо (id, data) либо (data) где data.id есть
 */
async function savePavilion(idOrData, dataIfTwoArgs) {
  // Если передан один аргумент с полем id - это объект data
  if (typeof idOrData === 'object' && idOrData.id) {
    const { id, ...rest } = idOrData;
    console.log('💾 Data: savePavilion вызван с объектом data, id =', id);
    return await updatePavilion(id, rest);
  }
  // Если два аргумента - это (id, data)
  if (dataIfTwoArgs) {
    console.log('💾 Data: savePavilion вызван с (id, data), id =', idOrData);
    return await updatePavilion(idOrData, dataIfTwoArgs);
  }
  throw new Error('savePavilion: неверные аргументы');
}

/**
 * Загружает изображение (заглушка - в реальном проекте интегрировать с Supabase Storage)
 * 
 * @param {File} file - Файл изображения
 * @param {string} pavilionId - ID павильона
 * @returns {Promise<string>} URL загруженного изображения
 */
async function uploadImage(file, pavilionId) {
  console.log('📸 Data: uploadImage (заглушка для будущей интеграции)');
  // TODO: Интегрировать с Supabase Storage
  return null;
}

// ============================================================
// ЭКСПОРТИРУЕМ ФУНКЦИИ ДЛЯ ГЛОБАЛЬНОГО ДОСТУПА
// ============================================================

// Делаем функции доступными из HTML и других скриптов
window.Data = {
  // Инициализация
  init: initData,
  
  // Павильоны
  getAllPavilions,
  getPavilionById,
  createPavilion,
  updatePavilion,
  savePavilion,  // Alias для совместимости с admin.js
  deletePavilion,
  
  // Арендаторы
  getAllTenants,
  getTenantByPhone,
  getTenantById,
  getCurrentUser,  // Получить текущего пользователя
  
  // Скидки
  addDiscount,
  removeDiscount,
  updateDiscount,
  
  // Поиск и фильтрация
  searchPavilions,
  filterByCategory,
  getPavilionsByTenant,
  
  // Загрузка файлов
  uploadImage,
  uploadFile: uploadImage,  // Alias для совместимости
  
  // Кэширование
  getCacheData,
  setCacheData,
  clearCacheData,
  clearAllCache,
  
  // Утилиты
  supabaseRequest,
  generateId,
  
  // Состояние
  state: DataState,
  config: DataConfig
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Data: DOM готов, инициализируем систему доступа к данным');
  initData();
});

// Fallback инициализация
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  if (!DataState.isInitialized) {
    initData();
  }
}
