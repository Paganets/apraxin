// Логика для Progressive Web App (PWA)
// Регистрация сервис-воркера и управление установкой

console.log('PWA: Инициализация...');

// Регистрация Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((registration) => {
        console.log('PWA: Service Worker зарегистрирован:', registration);

        // Проверка обновлений
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('PWA: Найдено обновление Service Worker');

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Оповещение о доступном обновлении
              showUpdatePrompt();
            }
          });
        });

        // Периодическая проверка обновлений
        setInterval(() => {
          registration.update();
        }, 60000); // Проверка каждую минуту
      })
      .catch((error) => {
        console.error('PWA: Ошибка регистрации Service Worker:', error);
      });
  });
}

// Обработка обновлений Service Worker
let refreshing = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});

// Показать уведомление об обновлении
function showUpdatePrompt() {
  const notification = document.createElement('div');
  notification.className = 'notification update-notification';
  notification.innerHTML = `
    <span>Доступно обновление приложения</span>
    <div>
      <button id="update-btn" class="btn btn-primary" style="margin-right: 0.5rem;">Обновить</button>
      <button id="dismiss-btn" class="btn btn-secondary">Позже</button>
    </div>
  `;

  document.body.insertBefore(notification, document.body.firstChild);

  document.getElementById('update-btn').addEventListener('click', () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
    }
  });

  document.getElementById('dismiss-btn').addEventListener('click', () => {
    notification.remove();
  });
}

// Проверка поддержки PWA функций
function checkPWASupport() {
  return {
    serviceWorker: 'serviceWorker' in navigator,
    manifestSupport: 'manifest' in document.head || !!document.querySelector('link[rel="manifest"]'),
    installPrompt: window.deferredPrompt !== undefined,
    standalone: window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  };
}

// Обработка события установки приложения
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
  showInstallPrompt();
});

// Показать кнопку установки
function showInstallPrompt() {
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', async () => {
      if (window.deferredPrompt) {
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        console.log(`PWA: Пользователь выбрал: ${outcome}`);
        window.deferredPrompt = null;
      }
    });
  }
}

// Обработка события установки
window.addEventListener('appinstalled', () => {
  console.log('PWA: Приложение установлено');
  window.deferredPrompt = null;
});

// Проверка статуса онлайна/оффлайна
window.addEventListener('online', () => {
  console.log('PWA: Приложение онлайн');
  document.body.classList.remove('offline');
});

window.addEventListener('offline', () => {
  console.log('PWA: Приложение оффлайн');
  document.body.classList.add('offline');
});

// Запрос разрешений
async function requestPermissions() {
  const permissions = {
    notification: false,
    location: false
  };

  // Запрос разрешения на уведомления
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      permissions.notification = true;
    } else if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      permissions.notification = result === 'granted';
    }
  }

  // Запрос разрешения на геолокацию
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      () => { permissions.location = true; },
      () => { permissions.location = false; }
    );
  }

  return permissions;
}

// Экспорт функций
window.PWA = {
  checkSupport: checkPWASupport,
  requestPermissions: requestPermissions
};
