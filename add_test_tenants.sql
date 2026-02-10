-- ============================================================
-- Добавление тестовых арендаторов в белый список
-- ============================================================

-- Шаг 1: Добавить поля is_owner и is_premium, если их нет
DO $$ 
BEGIN
    -- Добавляем is_owner если не существует
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'is_owner'
    ) THEN
        ALTER TABLE tenants ADD COLUMN is_owner BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN tenants.is_owner IS 'Владелец павильона (с правами администратора)';
    END IF;
    
    -- Добавляем is_premium если не существует
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'is_premium'
    ) THEN
        ALTER TABLE tenants ADD COLUMN is_premium BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN tenants.is_premium IS 'Премиум статус арендатора';
    END IF;
END $$;

-- Шаг 2: Добавить тестовых арендаторов
-- Номер 1: +79643968140
INSERT INTO tenants (phone, name, approved, is_owner, is_premium)
VALUES ('+79643968140', 'Тестовый арендатор 1', TRUE, FALSE, FALSE)
ON CONFLICT (phone) DO UPDATE 
SET approved = TRUE, is_owner = FALSE, is_premium = FALSE;

-- Номер 2: +79219543065
INSERT INTO tenants (phone, name, approved, is_owner, is_premium)
VALUES ('+79219543065', 'Тестовый арендатор 2', TRUE, FALSE, FALSE)
ON CONFLICT (phone) DO UPDATE 
SET approved = TRUE, is_owner = FALSE, is_premium = FALSE;

-- Номер 3: +79117551579
INSERT INTO tenants (phone, name, approved, is_owner, is_premium)
VALUES ('+79117551579', 'Тестовый арендатор 3', TRUE, FALSE, FALSE)
ON CONFLICT (phone) DO UPDATE 
SET approved = TRUE, is_owner = FALSE, is_premium = FALSE;

-- Проверка: вывести добавленных арендаторов
SELECT 
    phone,
    name,
    approved,
    is_owner,
    is_premium,
    created_at
FROM tenants
WHERE phone IN ('+79643968140', '+79219543065', '+79117551579')
ORDER BY phone;
