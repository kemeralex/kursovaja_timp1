-- Выполните в PostgreSQL, если у администратора role не «admin»:
UPDATE users SET role = 'admin' WHERE username = 'admin';
-- или:
-- UPDATE users SET role = 'admin' WHERE email = 'admin@kmb.local';
