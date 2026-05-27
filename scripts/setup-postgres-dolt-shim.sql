-- =============================================================================
-- Dolt Shim for Standard PostgreSQL (Neon)
--
-- Creates lightweight shims for every Dolt system table and stored procedure
-- that agents-api middleware calls, so the codebase works on standard Postgres
-- without any code changes and without requiring ENVIRONMENT=test.
--
-- Run this once against the Neon manage database after drizzle-kit migrate.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. dolt_branches  (real table — persists branch registry across requests)
-- ---------------------------------------------------------------------------
-- Branch names follow the pattern:
--   {tenantId}_main               (tenant-level ref)
--   {tenantId}_{projectId}_main   (project-level ref)
-- ensureBranchExists inserts rows here via DOLT_BRANCH(); resolveRef reads them.
CREATE TABLE IF NOT EXISTS dolt_branches (
    name                   text PRIMARY KEY,
    hash                   text NOT NULL DEFAULT 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    latest_committer       text DEFAULT 'system',
    latest_committer_email text DEFAULT 'system@example.com',
    latest_commit_date     timestamptz DEFAULT now(),
    latest_commit_message  text DEFAULT 'initial'
);

-- Seed the root 'main' branch that DOLT_CHECKOUT('main') expects.
INSERT INTO dolt_branches (name, hash)
VALUES ('main', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. dolt_status  (view — always empty → middleware skips DOLT_ADD/COMMIT)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW dolt_status AS
SELECT
    ''::text AS table_name,
    false    AS staged,
    ''::text AS status
WHERE false;


-- ---------------------------------------------------------------------------
-- 3. dolt_tags  (view — always empty → resolveRef finds no tags)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW dolt_tags AS
SELECT
    ''::text      AS tag_name,
    ''::text      AS tag_hash,
    ''::text      AS tagger,
    ''::text      AS tagger_email,
    now()         AS tagged_at,
    ''::text      AS message
WHERE false;


-- ---------------------------------------------------------------------------
-- 4. active_branch()  (returns 'main' — satisfies getActiveBranch checks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION active_branch()
RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    RETURN 'main';
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. DOLT_CHECKOUT(VARIADIC args text[])
--    Called as: DOLT_CHECKOUT('branch')
--               DOLT_CHECKOUT('-b', $1, $2)
--    '-b' form creates a new branch (we insert into dolt_branches).
--    Any other form is a no-op (no real checkout needed in flat Postgres).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_checkout(VARIADIC args text[])
RETURNS integer
LANGUAGE plpgsql AS $$
BEGIN
    IF array_length(args, 1) >= 2 AND args[1] = '-b' THEN
        INSERT INTO dolt_branches (name, hash)
        VALUES (args[2], COALESCE(args[3], 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
        ON CONFLICT (name) DO NOTHING;
    END IF;
    RETURN 0;
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. DOLT_BRANCH(VARIADIC args text[])
--    Called as: DOLT_BRANCH('new_branch')          -- create
--               DOLT_BRANCH('name', 'hash')         -- create from hash
--               DOLT_BRANCH('-D', 'name')            -- force delete
--               DOLT_BRANCH('-d', 'name')            -- delete
--               DOLT_BRANCH('-m', 'old', 'new')      -- rename
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_branch(VARIADIC args text[])
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    flag text;
BEGIN
    IF array_length(args, 1) = 0 THEN
        RETURN 0;
    END IF;

    flag := args[1];

    IF flag IN ('-D', '-d') THEN
        DELETE FROM dolt_branches WHERE name = args[2];

    ELSIF flag = '-m' THEN
        UPDATE dolt_branches SET name = args[3] WHERE name = args[2];

    ELSE
        -- Create branch.  args[1] = name, optional args[2] = start-point hash.
        INSERT INTO dolt_branches (name, hash)
        VALUES (args[1], COALESCE(args[2], 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
        ON CONFLICT (name) DO NOTHING;
    END IF;

    RETURN 0;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7. DOLT_ADD(VARIADIC args text[])  — no-op (dolt_status is always empty so
--    this is never reached in normal flow, but define it just in case)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_add(VARIADIC args text[])
RETURNS integer
LANGUAGE plpgsql AS $$
BEGIN
    RETURN 0;
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. DOLT_COMMIT(VARIADIC args text[])  — no-op, returns a fake commit hash
--    (also never reached in normal flow since dolt_status is empty)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_commit(VARIADIC args text[])
RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    RETURN 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
END;
$$;


-- ---------------------------------------------------------------------------
-- 9. DOLT_RESET(VARIADIC args text[])  — no-op
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_reset(VARIADIC args text[])
RETURNS integer
LANGUAGE plpgsql AS $$
BEGIN
    RETURN 0;
END;
$$;


-- ---------------------------------------------------------------------------
-- 10. DOLT_HASHOF(revision text)
--     Returns the stored hash for a known branch, or the fake hash otherwise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_hashof(revision text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    h text;
BEGIN
    SELECT hash INTO h FROM dolt_branches WHERE name = revision;
    RETURN COALESCE(h, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
END;
$$;


-- ---------------------------------------------------------------------------
-- 11. DOLT_TAG(VARIADIC args text[])  — no-op
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_tag(VARIADIC args text[])
RETURNS integer
LANGUAGE plpgsql AS $$
BEGIN
    RETURN 0;
END;
$$;


-- ---------------------------------------------------------------------------
-- 12. DOLT_LOG(revision text)
--     Called as: SELECT commit_hash FROM DOLT_LOG('branch') LIMIT 1
--     Returns one fake row so doltHashOf can resolve branch → hash.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_log(revision text DEFAULT 'main')
RETURNS TABLE (
    commit_hash      text,
    committer        text,
    committer_email  text,
    date             timestamptz,
    message          text
)
LANGUAGE plpgsql AS $$
DECLARE
    h text;
BEGIN
    SELECT hash INTO h FROM dolt_branches WHERE name = revision;
    RETURN QUERY SELECT
        COALESCE(h, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        'system'::text,
        'system@example.com'::text,
        now(),
        'shim commit'::text;
END;
$$;


-- ---------------------------------------------------------------------------
-- 13. dolt_schema_diff(from_branch, to_branch)
--     Called by ensureSchemaSync to check for schema changes between branches.
--     Always returns empty → schema sync is skipped entirely.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolt_schema_diff(from_branch text, to_branch text)
RETURNS TABLE (
    from_table_name       text,
    to_table_name         text,
    from_create_statement text,
    to_create_statement   text
)
LANGUAGE plpgsql AS $$
BEGIN
    -- No schema differences — we're on flat Postgres with no branching.
    RETURN;
END;
$$;
