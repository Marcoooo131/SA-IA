-- Vérifications du schéma : anti-double réservation et isolation RLS.
-- Usage : psql -f schema.sql puis psql -f schema_test.sql (en superutilisateur, sur une base vide).
\set ON_ERROR_STOP 0
INSERT INTO tenant(id,slug,name,vertical) VALUES
 ('00000000-0000-0000-0000-00000000000a','alpha','A','renovation'),
 ('00000000-0000-0000-0000-00000000000b','beta','B','renovation');
SET ROLE app_rw;
-- tenant A
BEGIN; SET LOCAL app.tenant_id='00000000-0000-0000-0000-00000000000a';
INSERT INTO resource(id,tenant_id,name) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Paul');
INSERT INTO service(id,tenant_id,name,meeting_type,duration_min) VALUES ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Visite','on_site',60);
INSERT INTO booking(tenant_id,service_id,resource_id,time_range,status) VALUES
 ('00000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','[2026-12-01 09:00+01,2026-12-01 10:00+01)','confirmed');
COMMIT;
\echo '--- attendu : erreur de chevauchement'
BEGIN; SET LOCAL app.tenant_id='00000000-0000-0000-0000-00000000000a';
INSERT INTO booking(tenant_id,service_id,resource_id,time_range,status) VALUES
 ('00000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','[2026-12-01 09:30+01,2026-12-01 10:30+01)','held');
ROLLBACK;
\echo '--- attendu : creneau adjacent [10h,11h) accepte'
BEGIN; SET LOCAL app.tenant_id='00000000-0000-0000-0000-00000000000a';
INSERT INTO booking(tenant_id,service_id,resource_id,time_range,status) VALUES
 ('00000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','[2026-12-01 10:00+01,2026-12-01 11:00+01)','held');
ROLLBACK;
\echo '--- tenant B voit 0 reservation, 0 tenant autre que lui'
BEGIN; SET LOCAL app.tenant_id='00000000-0000-0000-0000-00000000000b';
SELECT count(*) AS bookings_vus_par_B FROM booking;
SELECT slug FROM tenant;
\echo '--- attendu : B ne peut pas inserer pour A (violation RLS)'
INSERT INTO resource(tenant_id,name) VALUES ('00000000-0000-0000-0000-00000000000a','pirate');
ROLLBACK;
\echo '--- sans tenant positionne : 0 ligne'
SELECT count(*) AS sans_contexte FROM booking;
