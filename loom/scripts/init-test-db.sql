-- Runs once on volume initialization (first `docker compose up`, or after
-- `docker volume rm loom-postgres-data`). Mounted into the postgres image's
-- /docker-entrypoint-initdb.d/ directory by docker-compose.yml.
--
-- Creates the integration-test database alongside the main `loom` database.
-- Both databases use the default `postgres` superuser — dev credentials
-- only; never reuse this setup in production.

CREATE DATABASE loom_test;
