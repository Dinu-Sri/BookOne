-- scripts/coreguard/create-db-logins.sql — CoreGuard database logins (guide §6.9, owner action B4).
-- The OWNER runs this once per server as the database superuser (Portainer → postgres container → psql),
-- replacing every <…> placeholder, and puts the passwords in Portainer (MAINTENANCE_DATABASE_URL etc.).
-- Never commit real passwords. Step 12 adds bookone_owner, bookone_app and bookone_platform to this file.
-- Migration 060 must have run first (it creates the coreguard_reader/_writer/_maintenance groups).
-- 0. See who connects today, so step 3 doesn't lock anyone out:
SELECT DISTINCT usename FROM pg_stat_activity WHERE datname = '<DB_NAME>';
-- 1. maintenance login (archive restore and CoreGuard cleanup only)
CREATE ROLE bookone_maintenance LOGIN PASSWORD '<password>' BYPASSRLS IN ROLE coreguard_maintenance;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookone_maintenance;
GRANT USAGE ON SCHEMA coreguard TO bookone_maintenance;
GRANT INSERT ON coreguard.bypass_log TO bookone_maintenance;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA coreguard TO bookone_maintenance;
-- 2. CoreGuard monitor logins
CREATE ROLE coreguard_monitor    LOGIN PASSWORD '<password>' IN ROLE coreguard_reader;
ALTER  ROLE coreguard_monitor    SET default_transaction_read_only = on;
CREATE ROLE coreguard_monitor_rw LOGIN PASSWORD '<password>' IN ROLE coreguard_writer;
-- 3. main database: explicit CONNECT only (add every login found in step 0)
REVOKE CONNECT, TEMPORARY ON DATABASE <DB_NAME> FROM PUBLIC;
GRANT CONNECT ON DATABASE <DB_NAME> TO <current app user>, bookone_maintenance, coreguard_monitor, coreguard_monitor_rw;
-- 4. lab (staging): its own login and database, nothing else
CREATE ROLE coreguard_lab LOGIN PASSWORD '<password>' IN ROLE coreguard_maintenance;
CREATE DATABASE bookone_coreguard_lab OWNER coreguard_lab;
REVOKE CONNECT, TEMPORARY ON DATABASE bookone_coreguard_lab FROM PUBLIC;
-- 5. check: this must fail with "permission denied"
--    psql -U coreguard_lab -d <DB_NAME> -c 'select 1'
