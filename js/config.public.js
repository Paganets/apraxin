// Публичная конфигурация проекта "Карта Апрашки"
// Этот файл БЕЗОПАСЕН для коммита в репозиторий
// Секретные ключи НИКОГДА не хранятся в JavaScript файлах!

const AppConfig = {
  // Supabase Configuration (только публичный URL)
  supabase: {
    url: 'https://qagpuucdnkrzwsmnbymk.supabase.co'
    // anonKey будет передаваться через <meta> тег в HTML для безопасности
  },
  // Project Configuration
  project: {
    name: 'Карта Апрашки',
    description: 'Интерактивная карта Апраксина двора в Санкт-Петербурге',
    domain: 'apra-shka-map.github.io'
  },
  // Admin Configuration (только публичные данные)
  admin: {
    ownerName: 'Alex'
  },
  // PWA Configuration
  pwa: {
    themeColor: '#000000',
    backgroundColor: '#ffffff'
  },
  env: 'development'
};

if (typeof window !== 'undefined') {
  window.AppConfig = AppConfig;
}
export default AppConfig;
