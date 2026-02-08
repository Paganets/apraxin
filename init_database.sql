-- ============================================================
-- "Карта Апрашки" - SQL скрипт инициализации БД PostgreSQL
-- Проект: система управления павильонами и их информацией
-- ============================================================

-- ============================================================
-- 1. ТАБЛИЦА: tenants (Арендаторы/Владельцы павильонов)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT phone_format CHECK (phone ~ '^\+?[0-9]{10,15}$')
);

-- Индекс на поле phone для быстрого поиска по номеру
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);

-- Комментарии для таблицы tenants
COMMENT ON TABLE tenants IS 'Таблица арендаторов/владельцев павильонов';
COMMENT ON COLUMN tenants.id IS 'Уникальный идентификатор владельца (UUID)';
COMMENT ON COLUMN tenants.phone IS 'Номер телефона владельца в формате +7... (уникальный)';
COMMENT ON COLUMN tenants.name IS 'Имя владельца павильона';
COMMENT ON COLUMN tenants.approved IS 'Статус одобрения доступа (true - одобрен, false - не одобрен)';
COMMENT ON COLUMN tenants.created_at IS 'Дата и время создания записи';

-- ============================================================
-- 2. ТАБЛИЦА: pavilions (Павильоны)
-- ============================================================

CREATE TABLE IF NOT EXISTS pavilions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pavilion_number TEXT NOT NULL,
  category TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  brand_color TEXT DEFAULT '#ffffff',
  discounts JSONB DEFAULT '[]'::jsonb,
  location_x NUMERIC NOT NULL,
  location_y NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_hex_color CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT valid_coordinates CHECK (location_x >= -180 AND location_x <= 180 AND location_y >= -90 AND location_y <= 90)
);

-- Индекс на поле tenant_id для быстрого поиска павильонов по владельцу
CREATE INDEX IF NOT EXISTS idx_pavilions_tenant_id ON pavilions(tenant_id);

-- Индекс на поле pavilion_number для быстрого поиска по номеру павильона
CREATE INDEX IF NOT EXISTS idx_pavilions_pavilion_number ON pavilions(pavilion_number);

-- Комментарии для таблицы pavilions
COMMENT ON TABLE pavilions IS 'Таблица павильонов с информацией о магазинах и их расположении';
COMMENT ON COLUMN pavilions.id IS 'Уникальный идентификатор павильона (UUID)';
COMMENT ON COLUMN pavilions.tenant_id IS 'Ссылка на владельца павильона (внешний ключ на tenants.id)';
COMMENT ON COLUMN pavilions.pavilion_number IS 'Номер павильона в торговом комплексе (например: "Б-12")';
COMMENT ON COLUMN pavilions.category IS 'Категория товара: одежда, обувь, аксессуары, продукты и т.д.';
COMMENT ON COLUMN pavilions.shop_name IS 'Название магазина/брендированного павильона';
COMMENT ON COLUMN pavilions.brand_color IS 'HEX код цвета брендирования (по умолчанию: #ffffff)';
COMMENT ON COLUMN pavilions.discounts IS 'JSON массив скидок с информацией (например: [{"title": "Скидка 50%", "description": "На зимнюю коллекцию"}])';
COMMENT ON COLUMN pavilions.location_x IS 'Координата X на карте павильона (широта или условная координата)';
COMMENT ON COLUMN pavilions.location_y IS 'Координата Y на карте павильона (долгота или условная координата)';
COMMENT ON COLUMN pavilions.created_at IS 'Дата и время создания павильона';
COMMENT ON COLUMN pavilions.updated_at IS 'Дата и время последнего обновления информации о павильоне';

-- ============================================================
-- 3. ТРИГГЕР: автоматическое обновление updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_pavilions_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_pavilions_updated_at ON pavilions;
CREATE TRIGGER trigger_update_pavilions_updated_at
BEFORE UPDATE ON pavilions
FOR EACH ROW
EXECUTE FUNCTION update_pavilions_updated_at_column();

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Включить RLS для таблицы tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Включить RLS для таблицы pavilions
ALTER TABLE pavilions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. ПОЛИТИКИ RLS ДЛЯ ТАБЛИЦЫ tenants
-- ============================================================

-- Все пользователи могут читать информацию о владельцах (только одобренные)
DROP POLICY IF EXISTS tenants_read_policy ON tenants;
CREATE POLICY tenants_read_policy ON tenants
  FOR SELECT
  USING (approved = TRUE);

-- Аутентифицированные пользователи могут создавать новые записи
DROP POLICY IF EXISTS tenants_insert_policy ON tenants;
CREATE POLICY tenants_insert_policy ON tenants
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Владелец может обновлять свою информацию
DROP POLICY IF EXISTS tenants_update_policy ON tenants;
CREATE POLICY tenants_update_policy ON tenants
  FOR UPDATE
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- ============================================================
-- 6. ПОЛИТИКИ RLS ДЛЯ ТАБЛИЦЫ pavilions
-- ============================================================

-- Все пользователи могут читать информацию о павильонах (только одобренные владельцы)
DROP POLICY IF EXISTS pavilions_read_policy ON pavilions;
CREATE POLICY pavilions_read_policy ON pavilions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM tenants WHERE tenants.id = pavilions.tenant_id AND tenants.approved = TRUE)
  );

-- Аутентифицированные пользователи могут создавать павильоны
DROP POLICY IF EXISTS pavilions_insert_policy ON pavilions;
CREATE POLICY pavilions_insert_policy ON pavilions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Владелец павильона может обновлять информацию о нём
DROP POLICY IF EXISTS pavilions_update_policy ON pavilions;
CREATE POLICY pavilions_update_policy ON pavilions
  FOR UPDATE
  USING (
    tenant_id::text = auth.uid()::text
  )
  WITH CHECK (
    tenant_id::text = auth.uid()::text
  );

-- Владелец павильона может удалять свои павильоны
DROP POLICY IF EXISTS pavilions_delete_policy ON pavilions;
CREATE POLICY pavilions_delete_policy ON pavilions
  FOR DELETE
  USING (
    tenant_id::text = auth.uid()::text
  );

-- ============================================================
-- 6. ПРИМЕРЫ ДАННЫХ (раскомментировать при необходимости)
-- ============================================================

/*
-- Пример добавления владельца
INSERT INTO tenants (phone, name, approved)
VALUES ('+79001234567', 'Иван Сидоров', TRUE);

-- Пример добавления павильона
INSERT INTO pavilions (tenant_id, pavilion_number, category, shop_name, brand_color, location_x, location_y)
VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Б-12',
  'Одежда',
  'FashionStore',
  '#FF5733',
  55.7558,
  37.6173
);

-- Пример добавления скидок
UPDATE pavilions
SET discounts = '[
  {"title": "Скидка 50%", "description": "На зимнюю коллекцию"},
  {"title": "Buy 2 Get 1", "description": "На все товары"}
]'::jsonb
WHERE pavilion_number = 'Б-12';
*/

-- ============================================================
-- КОНЕЦ СКРИПТА
-- ============================================================
