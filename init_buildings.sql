-- ============================================================
-- Таблица BUILDINGS (Корпуса здания "Апраксин двор")
-- Описание: Хранит информацию о корпусах здания
-- ============================================================

-- Создание таблицы
CREATE TABLE IF NOT EXISTS buildings (
  -- Основные поля
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number TEXT NOT NULL UNIQUE,
  name TEXT,
  
  -- Структура здания
  total_floors INTEGER NOT NULL DEFAULT 1,
  
  -- Координаты и размеры на карте
  location_x NUMERIC NOT NULL,
  location_y NUMERIC NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  
  -- Дополнительная информация
  description TEXT,
  
  -- Служебные поля
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Индексы
-- ============================================================

-- Индекс для быстрого поиска по номеру корпуса
CREATE INDEX IF NOT EXISTS idx_buildings_building_number ON buildings(building_number);

-- Индекс для поиска по координатам (для пространственных запросов)
CREATE INDEX IF NOT EXISTS idx_buildings_location ON buildings(location_x, location_y);

-- ============================================================
-- Комментарии для документации
-- ============================================================

COMMENT ON TABLE buildings IS 
  'Таблица корпусов здания Апраксин двор. Содержит информацию о каждом корпусе, его расположении и структуре.';

COMMENT ON COLUMN buildings.id IS 
  'Уникальный идентификатор корпуса (UUID)';

COMMENT ON COLUMN buildings.building_number IS 
  'Номер корпуса (например: "33", "А", "Б-1"). Уникальное значение для каждого корпуса.';

COMMENT ON COLUMN buildings.name IS 
  'Название корпуса (например: "Корпус 33", "Крыло А"). Может быть более читаемое название.';

COMMENT ON COLUMN buildings.total_floors IS 
  'Общее количество этажей в корпусе (например: 2, 3, 5)';

COMMENT ON COLUMN buildings.location_x IS 
  'Координата X корпуса на общей карте (в условных единицах или пикселях)';

COMMENT ON COLUMN buildings.location_y IS 
  'Координата Y корпуса на общей карте (в условных единицах или пикселях)';

COMMENT ON COLUMN buildings.width IS 
  'Ширина корпуса на карте (в условных единицах или пикселях)';

COMMENT ON COLUMN buildings.height IS 
  'Высота корпуса на карте (в условных единицах или пикселях)';

COMMENT ON COLUMN buildings.description IS 
  'Описание корпуса: история, особенности, дополнительная информация';

COMMENT ON COLUMN buildings.created_at IS 
  'Дата и время создания записи о корпусе (UTC)';

COMMENT ON COLUMN buildings.updated_at IS 
  'Дата и время последнего обновления информации о корпусе (UTC)';

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Включаем RLS для таблицы
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

-- Политика 1: Основная политика - чтение для всех
CREATE POLICY "buildings_read_all" ON buildings
  FOR SELECT
  USING (true);

-- Политика 2: Запись только для аутентифицированных пользователей
CREATE POLICY "buildings_write_authenticated" ON buildings
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Политика 3: Обновление только для аутентифицированных пользователей
CREATE POLICY "buildings_update_authenticated" ON buildings
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Политика 4: Удаление только для аутентифицированных пользователей
CREATE POLICY "buildings_delete_authenticated" ON buildings
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================
-- Триггер для автоматического обновления updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_buildings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER buildings_update_timestamp
BEFORE UPDATE ON buildings
FOR EACH ROW
EXECUTE FUNCTION update_buildings_updated_at();

-- ============================================================
-- Пример данных (опционально)
-- ============================================================

-- Раскомментируй для добавления примеров:
/*
INSERT INTO buildings (
  building_number,
  name,
  total_floors,
  location_x,
  location_y,
  width,
  height,
  description
) VALUES
  ('33', 'Корпус 33 (Главное здание)', 5, 100, 100, 300, 400, 'Основное здание Апраксина двора'),
  ('А', 'Крыло А (Левое)', 3, 50, 150, 200, 300, 'Левое крыло'),
  ('Б-1', 'Корпус Б-1 (Правое крыло)', 2, 350, 200, 250, 250, 'Правое крыло с дополнительными павильонами');
*/

-- ============================================================
-- Конец скрипта
-- ============================================================
