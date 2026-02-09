/**
 * AUTH.JS - Система аутентификации и управления пользователями (арендаторами)
 * 
 * Особенности:
 * - Аутентификация ТОЛЬКО по номеру телефона (без паролей)
 * - Проверка в белом списке таблицы 'tenants' базы Supabase
 * - Сохранение сессии в localStorage
 * - Защита маршрутов и доступа к админке
 * - Управление глобальным состоянием пользователя
 */

// ============================================================
// КОНФИГУРАЦИЯ И ИНИЦИАЛИЗАЦИЯ
// ============================================================

/**
 * Конфигурация Supabase (получается из window.SupabaseConfig)
 * window.SupabaseConfig инициализируется в index.html из <meta> тегов
 * 
 * Получить ключи можно в Settings → API в консоли Supabase
 * НИКОГДА не твёрдкодируй реальные ключи в JavaScript файлах!
 */
const AuthConfig = {
  // Инициализируется в initAuth() из window.SupabaseConfig или <meta> тегов
  SUPABASE_URL: null,
  SUPABASE_ANON_KEY: null,
  
  // Таблица с данными арендаторов
  DB_TABLE_TENANTS: 'tenants',
  
  // Время жизни сессии (в часах)
  SESSION_TIMEOUT: 24
};

/**
 * Состояние аутентификации и текущего пользователя
 */
const AuthState = {
  // Текущий авторизованный арендатор
  currentTenant: null,
  
  // Статус загрузки
  isLoading: false,
  
  // Время последней активности (для отслеживания timeout)
  lastActivity: null,
  
  // Флаг инициализации
  isInitialized: false
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ АУТЕНТИФИКАЦИИ
// ============================================================

/**
 * Инициализирует систему аутентификации при загрузке страницы
 * - Проверяет сохранённую сессию
 * - Подключает обработчики событий
 * - Проверяет авторизацию для защищённых страниц
 */
async function initAuth() {
  console.log('🔐 Auth: Инициализация системы аутентификации');
  
  try {
    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ КОНФИГУРАЦИИ SUPABASE
    // ============================================================
    // Получаем ключи из window.SupabaseConfig (инициализирован в index.html)
    // или через fallback из <meta> тегов
    
    if (window.SupabaseConfig?.url && window.SupabaseConfig?.anonKey) {
      AuthConfig.SUPABASE_URL = window.SupabaseConfig.url;
      AuthConfig.SUPABASE_ANON_KEY = window.SupabaseConfig.anonKey;
      console.log('✅ Auth: Конфигурация Supabase загружена из window.SupabaseConfig');
      console.log('  📍 URL:', AuthConfig.SUPABASE_URL);
      console.log('  🔑 Ключ API (первые 20 символов):', AuthConfig.SUPABASE_ANON_KEY.substring(0, 20) + '...');
    } else {
      // Fallback: получаем из <meta> тегов
      const urlMeta = document.querySelector('meta[name="supabase-url"]');
      const keyMeta = document.querySelector('meta[name="supabase-anon-key"]');
      
      if (urlMeta?.content && keyMeta?.content) {
        AuthConfig.SUPABASE_URL = urlMeta.content;
        AuthConfig.SUPABASE_ANON_KEY = keyMeta.content;
        console.log('✅ Auth: Конфигурация Supabase загружена из <meta> тегов');
        console.log('  📍 URL:', AuthConfig.SUPABASE_URL);
        console.log('  🔑 Ключ API (первые 20 символов):', AuthConfig.SUPABASE_ANON_KEY.substring(0, 20) + '...');
      } else {
        throw new Error('Конфигурация Supabase не найдена. Проверьте наличие window.SupabaseConfig или <meta> тегов в HTML');
      }
    }
    
    // Восстанавливаем сессию из localStorage
    const savedSession = localStorage.getItem('aprashka_auth_session');
    if (savedSession) {
      AuthState.currentTenant = JSON.parse(savedSession);
      console.log(`✅ Auth: Сессия восстановлена для ${AuthState.currentTenant.phone}`);
    }
    
    // Обновляем UI в соответствии с состоянием авторизации
    updateAuthUI();
    
    // Подключаем обработчики для элементов на странице
    setupAuthEventHandlers();
    
    // Обновляем время последней активности
    AuthState.lastActivity = Date.now();
    
    // Отслеживаем активность пользователя
    document.addEventListener('click', () => {
      AuthState.lastActivity = Date.now();
    });
    
    AuthState.isInitialized = true;
    console.log('✅ Auth: Инициализация завершена');
  } catch (error) {
    console.error('❌ Auth: Ошибка инициализации', error);
  }
}

/**
 * Подключает обработчики на элементы HTML
 */
function setupAuthEventHandlers() {
  // Кнопка входа в header
  const authBtn = document.querySelector('.auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', handleAuthButtonClick);
  }
  
  // Форма входа на странице входа (если существует)
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginFormSubmit);
  }
  
  // Кнопка выхода (если существует)
  const logoutBtn = document.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

// ============================================================
// АУТЕНТИФИКАЦИЯ ПО НОМЕРУ ТЕЛЕФОНА
// ============================================================

/**
 * Проверяет номер телефона в белом списке (таблица tenants)
 * 
 * @param {string} phone - Номер телефона в формате +7XXXXXXXXXX
 * @returns {Promise<Object>} Объект арендатора если найден и approved, иначе null
 */
async function checkPhone(phone) {
  console.log(`🔍 Auth: Проверка номера телефона ${phone}`);
  
  try {
    // Валидируем номер перед отправкой в БД
    if (!validatePhoneNumber(phone)) {
      console.error('❌ Auth: Неверный формат номера телефона. Ожидается: +7XXXXXXXXXX');
      throw new Error('Неверный формат номера телефона');
    }
    
    console.log('✅ Формат номера валиден');
    
    // Формируем URL для запроса
    const url = `${AuthConfig.SUPABASE_URL}/rest/v1/${AuthConfig.DB_TABLE_TENANTS}?phone=eq.${encodeURIComponent(phone)}&select=*`;
    console.log('📍 URL запроса:', url);
    console.log('🔑 Ключ API (первые 20 символов):', AuthConfig.SUPABASE_ANON_KEY.substring(0, 20) + '...');
    
    // Запрос к Supabase REST API (без необходимости в клиенте)
    const response = await fetch(
      url,
      {
        method: 'GET',
        headers: {
          'apikey': AuthConfig.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('📊 Статус ответа:', response.status);
    console.log('📝 Заголовки ответа:', {
      'content-type': response.headers.get('content-type'),
      'content-range': response.headers.get('content-range')
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP ошибка:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('📦 Полученные данные:', data);
    console.log('📊 Количество записей:', data?.length || 0);
    
    // Если номер не найден в БД
    if (!data || data.length === 0) {
      console.warn('⚠️ Auth: Номер не найден в базе данных (никаких записей)');
      return null;
    }
    
    const tenant = data[0];
    console.log('👤 Найдная запись:', {
      id: tenant.id,
      name: tenant.name,
      phone: tenant.phone,
      approved: tenant.approved,
      email: tenant.email || 'нет'
    });
    
    // Проверяем статус одобрения
    if (!tenant.approved) {
      console.warn('⚠️ Auth: Аккаунт не одобрен администратором (approved = false)');
      return null;
    }
    
    console.log(`✅ Auth: Номер верифицирован. Найден арендатор: ${tenant.name}`);
    return tenant;
    
  } catch (error) {
    console.error('❌ Auth: Ошибка при проверке номера', error);
    console.error('📋 Полная ошибка:', error.message, error.stack);
    throw error;
  }
}

/**
 * Валидирует формат номера телефона
 * 
 * @param {string} phone - Номер телефона
 * @returns {boolean} true если формат верный
 */
function validatePhoneNumber(phone) {
  // Проверяем формат +7XXXXXXXXXX (11 цифр)
  const phoneRegex = /^\+7\d{10}$/;
  const trimmed = phone.trim();
  const isValid = phoneRegex.test(trimmed);
  if (!isValid) {
    console.log('❌ Валидация не прошла:', {
      input: phone,
      trimmed: trimmed,
      length: trimmed.length,
      regex: phoneRegex.toString()
    });
  }
  return isValid;
}

/**
 * Форматирует номер телефона в стандартный вид
 * 
 * @param {string} phone - Номер телефона (с любыми символами)
 * @returns {string} Форматированный номер +7XXXXXXXXXX
 */
function formatPhoneNumber(phone) {
  console.log('🔄 Форматирование номера:', {
    input: phone,
    length: phone.length
  });
  
  // Удаляем все нецифровые символы
  const digitsOnly = phone.replace(/\D/g, '');
  console.log('  └─ Только цифры:', digitsOnly, '(' + digitsOnly.length + ' цифр)');
  
  // Если начинается с 8, заменяем на 7 (для российских номеров)
  const normalized = digitsOnly.startsWith('8')
    ? '7' + digitsOnly.slice(1)
    : digitsOnly;
  console.log('  └─ Нормализовано:', normalized, '(' + normalized.length + ' цифр)');
  
  // Проверяем, что это 11 цифр (для России)
  if (normalized.length !== 11) {
    console.error('  ❌ Неверная длина:', normalized.length, 'вместо 11 цифр');
    throw new Error('Номер должен содержать 11 цифр');
  }
  
  const formatted = `+${normalized}`;
  console.log('  ✅ Результат:', formatted);
  return formatted;
}

/**
 * Обработчик формы входа
 * 
 * @param {Event} event - События submit формы
 */
async function handleLoginFormSubmit(event) {
  event.preventDefault();
  console.log('📤 Форма входа отправлена');
  
  try {
    AuthState.isLoading = true;
    
    // Получаем номер телефона из формы
    const phoneInput = document.getElementById('phone-input') || 
                       event.target.querySelector('input[type="tel"]');
    if (!phoneInput) {
      throw new Error('Поле ввода номера телефона не найдено');
    }
    
    const phone = phoneInput.value;
    console.log('📱 Введён номер телефона (сырой):', phone);
    console.log('📝 Длина номера:', phone.length, 'символов');
    
    // Форматируем номер
    const formattedPhone = formatPhoneNumber(phone);
    console.log('✅ Отформатирован номер:', formattedPhone);
    console.log('✓ Формат: +7 + 10 цифр =', formattedPhone.length, 'символов');
    
    // Проверяем номер в БД
    console.log('🔄 Отправляем запрос в Supabase...');
    const tenant = await checkPhone(formattedPhone);
    
    if (!tenant) {
      // Номер не найден или не одобрен
      console.log('❌ Номер не найден или не одобрен');
      console.log('💡 Убедитесь, что:');
      console.log('   1. Номер существует в таблице tenants');
      console.log('   2. Поле approved имеет значение true');
      console.log('   3. Ключ API работает (проверьте Supabase Settings > API Keys)');
      showAuthError('Свяжитесь с Администрацией Апраксиного двора');
      AuthState.isLoading = false;
      return;
    }
    
    console.log('✅ Аутентификация успешна, сохраняю сессию');
    console.log('👤 Сессия для:', tenant.name, '(' + tenant.phone + ')');
    
    // Успешная аутентификация - сохраняем сессию
    await createSession(tenant);
    
    // Очищаем форму
    event.target.reset();
    
    // Перенаправляем в админ-панель или главную страницу
    console.log('🚀 Переходу в админ-панель');
    setTimeout(() => {
      window.location.href = 'admin.html';
    }, 500);
    
  } catch (error) {
    console.error('❌ Auth: Ошибка входа', error);
    console.error('📋 Описание ошибки:', error.message);
    console.error('🔍 Stack trace:', error.stack);
    showAuthError(error.message || 'Ошибка при входе. Попробуйте ещё раз');
  } finally {
    AuthState.isLoading = false;
  }
}

/**
 * Обработчик клика на кнопку входа в header
 */
function handleAuthButtonClick() {
  console.log('🔘 Кнопка Вход нажата');
  
  if (AuthState.currentTenant) {
    // Если уже авторизован - показываем профиль/меню
    console.log('👤 Пользователь уже авторизован, открываю меню');
    showUserMenu();
  } else {
    // Иначе - открываем модальное окно входа через хеш
    console.log('🔓 Открываю модальное окно входа');
    window.location.hash = '#login';
  }
}

// ============================================================
// УПРАВЛЕНИЕ СЕССИЕЙ
// ============================================================

/**
 * Создаёт активную сессию пользователя
 * 
 * @param {Object} tenant - Объект арендатора из БД
 */
async function createSession(tenant) {
  console.log(`💾 Auth: Создание сессии для ${tenant.phone}`);
  
  // Сохраняем данные арендатора в состояние
  AuthState.currentTenant = {
    id: tenant.id,
    name: tenant.name,
    phone: tenant.phone,
    email: tenant.email || null,
    approved: tenant.approved,
    created_at: tenant.created_at,
    loginTime: new Date().toISOString()
  };
  
  // Сохраняем в localStorage
  localStorage.setItem(
    'aprashka_auth_session',
    JSON.stringify(AuthState.currentTenant)
  );
  
  // Обновляем UI
  updateAuthUI();
  
  console.log(`✅ Auth: Сессия создана. Арендатор: ${tenant.name}`);
}

/**
 * Получает текущего авторизованного арендатора
 * 
 * @returns {Object|null} Текущий арендатор или null если не авторизован
 */
function getCurrentTenant() {
  return AuthState.currentTenant;
}

/**
 * Проверяет, авторизован ли пользователь
 * 
 * @returns {boolean} true если авторизован
 */
function isAuthenticated() {
  return AuthState.currentTenant !== null;
}

/**
 * Обработчик выхода из системы
 */
function handleLogout() {
  console.log('🚪 Auth: Выход из системы');
  logout();
}

/**
 * Выполняет выход из системы
 * Очищает сессию и обновляет UI
 */
function logout() {
  // Удаляем данные из памяти
  AuthState.currentTenant = null;
  AuthState.lastActivity = null;
  
  // Удаляем из localStorage
  localStorage.removeItem('aprashka_auth_session');
  
  // Обновляем UI
  updateAuthUI();
  
  // Перенаправляем на главную страницу
  console.log('✅ Auth: Выход выполнен успешно');
  window.location.href = 'index.html';
}

// ============================================================
// ЗАЩИТА МАРШРУТОВ
// ============================================================

/**
 * Проверяет авторизацию перед доступом к защищённым страницам
 * Используется для защиты админ-панели и других ограниченных разделов
 * 
 * @param {Object} options - Опции
 * @param {string} options.redirectTo - URL для перенаправления если не авторизован (по умолчанию /)
 * @returns {boolean} true если авторизован
 */
function requireAuth(options = {}) {
  const { redirectTo = 'index.html' } = options;
  
  if (!isAuthenticated()) {
    console.warn('🔒 Auth: Доступ запрещён - требуется авторизация');
    window.location.href = redirectTo;
    return false;
  }
  
  console.log(`🔓 Auth: Доступ разрешён для ${AuthState.currentTenant.phone}`);
  return true;
}

/**
 * Проверяет, что пользователь может редактировать павильоны
 * (текущая простая версия - все авторизованные могут редактировать)
 * 
 * @returns {boolean} true если может редактировать
 */
function canEditPavilions() {
  return isAuthenticated();
}

// ============================================================
// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА
// ============================================================

/**
 * Обновляет UI в зависимости от статуса авторизации
 */
function updateAuthUI() {
  const authBtn = document.querySelector('.auth-btn');
  if (!authBtn) return;
  
  if (AuthState.currentTenant) {
    // Пользователь авторизован
    authBtn.textContent = `👤 ${AuthState.currentTenant.name}`;
    authBtn.classList.add('logged-in');
    authBtn.setAttribute('aria-label', `Профиль ${AuthState.currentTenant.name}`);
  } else {
    // Пользователь не авторизован
    authBtn.textContent = '🔐 Вход';
    authBtn.classList.remove('logged-in');
    authBtn.setAttribute('aria-label', 'Вход в систему');
  }
}

/**
 * Показывает меню пользователя (при клике на кнопку профиля)
 */
function showUserMenu() {
  const tenant = AuthState.currentTenant;
  if (!tenant) return;
  
  const menu = document.createElement('div');
  menu.className = 'user-menu';
  menu.innerHTML = `
    <div class="user-info">
      <div class="user-name">${tenant.name}</div>
      <div class="user-phone">${tenant.phone}</div>
    </div>
    <hr>
    <a href="admin.html" class="menu-item">📊 Админ-панель</a>
    <button onclick="logout()" class="menu-item danger">🚪 Выход</button>
  `;
  
  // Простой вариант - просто показываем alert с опциями
  alert(`Вы вошли как: ${tenant.name}\n\nВерсия: Демонстрационная`);
}

// ============================================================
// ОБРАБОТКА ОШИБОК И СООБЩЕНИЙ
// ============================================================

/**
 * Показывает сообщение об ошибке для пользователя
 * 
 * @param {string} message - Текст ошибки
 */
function showAuthError(message) {
  // Способ 1: Встроенный alert (простой вариант)
  alert(`❌ ${message}`);
  
  // Способ 2: Специальный элемент на странице (если существует)
  const errorElement = document.getElementById('auth-error');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Скрываем через 5 секунд
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }
}

/**
 * Показывает сообщение об успехе
 * 
 * @param {string} message - Текст сообщения
 */
function showAuthSuccess(message) {
  console.log(`✅ Auth: ${message}`);
  
  const successElement = document.getElementById('auth-success');
  if (successElement) {
    successElement.textContent = message;
    successElement.style.display = 'block';
    
    // Скрываем через 3 секунды
    setTimeout(() => {
      successElement.style.display = 'none';
    }, 3000);
  }
}

// ============================================================
// ЭКСПОРТИРУЕМ ФУНКЦИИ ДЛЯ ГЛОБАЛЬНОГО ДОСТУПА
// ============================================================

// Делаем функции доступными из HTML и других скриптов
window.Auth = {
  // Инициализация
  init: initAuth,
  
  // Аутентификация
  checkPhone,
  validatePhoneNumber,
  formatPhoneNumber,
  
  // Управление сессией
  createSession,
  getCurrentTenant,
  logout,
  isAuthenticated,
  
  // Защита маршрутов
  requireAuth,
  canEditPavilions,
  
  // UI
  updateAuthUI,
  showUserMenu,
  
  // Ошибки
  showAuthError,
  showAuthSuccess,
  
  // Состояние
  state: AuthState,
  config: AuthConfig
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Auth: DOM готов, инициализируем систему аутентификации');
  initAuth();
});

// Fallback инициализация для случаев, когда DOM уже готов
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  if (!AuthState.isInitialized) {
    initAuth();
  }
}
