// ============================================================
// Service Worker для приложения "Карта Апрашки"
// Обеспечивает работу приложения в режиме оффлайн
// ============================================================

const CACHE_VERSION = 'v1';
const CACHE_NAME = `apra-shka-${CACHE_VERSION}`;

// Список файлов для кэширования при установке
const STATIC_ASSETS = [
  '/index.html',
  '/admin.html',
  '/pavilion.html',
  '/manifest.json',
  '/css/style.css',
  '/css/admin.css',
  '/js/pwa.js',
  '/js/auth.js',
  '/js/data.js',
  '/js/map.js'
];

// Расширения файлов для кэширования при запросе
const CACHEABLE_EXTENSIONS = ['.js', '.css', '.html', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.ttf'];

// ============================================================
// События установки Service Worker
// ============================================================

self.addEventListener('install', (event) => {
  console.log(`[SW] Установка Service Worker (${CACHE_NAME})`);

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        
        // Кэшируем статические файлы
        console.log('[SW] Кэширование статических файлов...');
        await cache.addAll(STATIC_ASSETS);
        
        // Принудительно активируем новый Service Worker
        self.skipWaiting();
        
        console.log(`[SW] Успешно кэширована ${STATIC_ASSETS.length} файлов`);
      } catch (error) {
        console.error('[SW] Ошибка при кэшировании файлов:', error);
      }
    })()
  );
});

// ============================================================
// События активации Service Worker
// ============================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Активация Service Worker');

  event.waitUntil(
    (async () => {
      try {
        // Получаем список всех кэшей
        const cacheNames = await caches.keys();
        
        // Удаляем старые версии кэша
        await Promise.all(
          cacheNames
            .filter((cacheName) => {
              const isCacheStale = cacheName.startsWith('apra-shka-') && 
                                  cacheName !== CACHE_NAME;
              if (isCacheStale) {
                console.log(`[SW] Удаление старого кэша: ${cacheName}`);
              }
              return isCacheStale;
            })
            .map((cacheName) => caches.delete(cacheName))
        );

        // Переходим в контроль всех клиентов
        await self.clients.claim();
        console.log('[SW] Service Worker активирован и контролирует все клиенты');
      } catch (error) {
        console.error('[SW] Ошибка при активации:', error);
      }
    })()
  );
});

// ============================================================
// Перехват сетевых запросов (Fetch Event)
// ============================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Игнорируем не-GET запросы
  if (request.method !== 'GET') {
    return;
  }

  // Стратегия: Cache First для статических файлов, Network First для API
  const url = new URL(request.url);
  
  // Определяем стратегию кэширования
  const isStaticAsset = CACHEABLE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
  
  if (isStaticAsset) {
    // Cache First: сначала кэш, потом сеть
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // Network First: сначала сеть, потом кэш
    event.respondWith(networkFirstStrategy(request));
  }
});

// ============================================================
// Стратегия: Cache First
// ============================================================

async function cacheFirstStrategy(request) {
  try {
    // Проверяем кэш
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`[SW] Из кэша: ${request.url}`);
      return cachedResponse;
    }

    // Если не в кэше, запрашиваем из сети
    const networkResponse = await fetch(request);
    
    // Кэшируем успешный ответ
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log(`[SW] Кэшировано из сети: ${request.url}`);
    }

    return networkResponse;
  } catch (error) {
    console.error(`[SW] Ошибка Cache First для ${request.url}:`, error);
    
    // Возвращаем кэшированный ответ как fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Если нет кэша, возвращаем ошибку оффлайна
    return new Response('Нет соединения и нет данных в кэше', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// ============================================================
// Стратегия: Network First
// ============================================================

async function networkFirstStrategy(request) {
  const NETWORK_TIMEOUT = 5000; // 5 секунд

  try {
    // Пытаемся получить данные из сети с таймаутом
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Network timeout')), NETWORK_TIMEOUT)
    );

    try {
      const networkResponse = await Promise.race([networkPromise, timeoutPromise]);
      
      // Кэшируем успешный ответ
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        console.log(`[SW] Из сети (новое): ${request.url}`);
      }

      return networkResponse;
    } catch (error) {
      // При ошибке сети проверяем кэш
      console.log(`[SW] Ошибка сети, ищем в кэше: ${request.url}`);
      const cachedResponse = await caches.match(request);
      
      if (cachedResponse) {
        console.log(`[SW] Из кэша (fallback): ${request.url}`);
        return cachedResponse;
      }

      throw error;
    }
  } catch (error) {
    console.error(`[SW] Ошибка Network First для ${request.url}:`, error);

    // Последняя попытка - проверяем кэш
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Возвращаем оффлайн ошибку
    return new Response('API недоступна', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        error: 'offline',
        message: 'Нет соединения с интернетом'
      })
    });
  }
}

// ============================================================
// Обработка сообщений от приложения
// ============================================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  console.log(`[SW] Получено сообщение: ${type}`, payload);

  switch (type) {
    case 'SKIP_WAITING':
      // Обновление Service Worker
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      // Очистка кэша
      event.waitUntil(
        (async () => {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
          console.log('[SW] Кэш полностью очищен');
        })()
      );
      break;

    case 'CACHE_URLS':
      // Добавление дополнительных URL в кэш
      if (payload && Array.isArray(payload.urls)) {
        event.waitUntil(
          (async () => {
            const cache = await caches.open(CACHE_NAME);
            await Promise.all(
              payload.urls.map((url) =>
                cache.add(url).catch((error) => {
                  console.warn(`[SW] Не удалось кэшировать ${url}:`, error);
                })
              )
            );
            console.log(`[SW] Кэшировано ${payload.urls.length} дополнительных URL`);
          })()
        );
      }
      break;

    default:
      console.warn(`[SW] Неизвестный тип сообщения: ${type}`);
  }
});

// ============================================================
// Периодическое обновление кэша
// ============================================================

// Проверяем обновления в фоне (если поддерживается)
self.addEventListener('sync', (event) => {
  if (event.tag === 'update-cache') {
    console.log('[SW] Фоновое обновление кэша');
    event.waitUntil(updateCache());
  }
});

async function updateCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    
    // Пытаемся обновить статические файлы
    const updatePromises = STATIC_ASSETS.map((url) =>
      fetch(url)
        .then((response) => {
          if (response.status === 200) {
            cache.put(url, response);
            console.log(`[SW] Обновлен кэш: ${url}`);
          }
        })
        .catch((error) => {
          console.warn(`[SW] Не удалось обновить ${url}:`, error);
        })
    );

    await Promise.all(updatePromises);
  } catch (error) {
    console.error('[SW] Ошибка при обновлении кэша:', error);
  }
}

console.log(`[SW] Service Worker (${CACHE_NAME}) загружен`);
