-- ============================================================================
-- Job Board — seed data
-- ============================================================================
-- Run AFTER schema.sql:   psql -d job_board -f sql/seed.sql
--
-- This is a small but deliberately-shaped dataset. It is designed so that real
-- SQL practice is interesting:
--   * a job with NO applications          -> practice LEFT JOIN / "find gaps"
--   * a job with NULL salaries            -> practice NULL handling / COALESCE
--   * candidates who applied to several jobs, jobs with several applicants
--   * a spread of statuses (pending / accepted / rejected)
--   * varied salaries, locations, and dates for filtering / sorting / grouping
--
-- About the id columns: the tables use GENERATED ALWAYS AS IDENTITY, so we do
-- NOT insert ids ourselves. To wire up relationships we look rows up by their
-- natural/unique columns (email for users, name for companies, title for jobs).
-- The subqueries below are themselves good SQL practice.
-- ============================================================================

-- Start clean so this file can be re-run without piling up duplicate rows.
-- TRUNCATE ... RESTART IDENTITY resets the id counters; CASCADE also clears
-- child tables that reference these.
TRUNCATE applications, jobs, companies, users RESTART IDENTITY CASCADE;


-- ----------------------------------------------------------------------------
-- users  (5 candidates, 3 employers)
-- ----------------------------------------------------------------------------
INSERT INTO users (name, email, role, created_at) VALUES
    ('Alice Johnson',  'alice@example.com',  'candidate', '2026-01-05 09:00:00+00'),
    ('Bob Smith',      'bob@example.com',    'candidate', '2026-01-08 14:30:00+00'),
    ('Carol Williams', 'carol@example.com',  'candidate', '2026-02-01 11:15:00+00'),
    ('David Brown',    'david@example.com',  'candidate', '2026-02-10 08:45:00+00'),
    ('Emma Davis',     'emma@example.com',   'candidate', '2026-03-01 16:20:00+00'),
    ('Frank Miller',   'frank@example.com',  'employer',  '2026-01-02 10:00:00+00'),
    ('Grace Lee',      'grace@example.com',  'employer',  '2026-01-03 10:00:00+00'),
    ('Henry Wilson',   'henry@example.com',  'employer',  '2026-01-10 10:00:00+00');


-- ----------------------------------------------------------------------------
-- companies  (4 companies)
-- ----------------------------------------------------------------------------
INSERT INTO companies (name, description, created_at) VALUES
    ('Acme Corp',        'General-purpose widgets and gadgets.',        '2026-01-02 10:00:00+00'),
    ('Globex Inc',       'Data and analytics products.',                '2026-01-03 10:00:00+00'),
    ('Initech',          'Enterprise software and consulting.',         '2026-01-10 10:00:00+00'),
    ('Umbrella Systems', 'Applied research and machine learning.',      '2026-02-01 10:00:00+00');


-- ----------------------------------------------------------------------------
-- jobs  (8 jobs, 2 per company; titles are unique so we can look them up below)
-- ----------------------------------------------------------------------------
INSERT INTO jobs (company_id, title, description, salary_min, salary_max, location, created_at) VALUES
    ((SELECT id FROM companies WHERE name = 'Acme Corp'),
        'Senior Backend Engineer', 'Own our core APIs and data model.',
        120000, 160000, 'Remote',            '2026-01-15 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Acme Corp'),
        'Frontend Developer', 'Build the candidate-facing web app.',
        90000, 120000, 'New York, NY',        '2026-01-20 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Globex Inc'),
        'Data Analyst', 'Turn product data into insights.',
        80000, 110000, 'Remote',              '2026-01-25 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Globex Inc'),
        'DevOps Engineer', 'Own CI/CD and cloud infrastructure.',
        110000, 150000, 'Austin, TX',         '2026-02-05 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Initech'),
        'Product Manager', 'Define the roadmap and priorities.',
        130000, 170000, 'San Francisco, CA',  '2026-02-12 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Initech'),
        'QA Engineer', 'Design and run our test strategy.',
        70000, 95000, 'Remote',               '2026-02-20 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Umbrella Systems'),
        'Machine Learning Engineer', 'Ship models to production.',
        140000, 190000, 'Boston, MA',         '2026-03-05 12:00:00+00'),

    -- Deliberately NULL salaries + no applications (see below): great for
    -- practicing NULL handling and LEFT JOINs.
    ((SELECT id FROM companies WHERE name = 'Umbrella Systems'),
        'Junior Backend Engineer', 'Entry-level role; salary to be discussed.',
        NULL, NULL, 'Remote',                 '2026-03-10 12:00:00+00');


-- ----------------------------------------------------------------------------
-- applications  (10 applications)
-- ----------------------------------------------------------------------------
-- Only candidates apply. Note "Junior Backend Engineer" gets NO applications on
-- purpose, and "Data Analyst" gets three.
INSERT INTO applications (job_id, user_id, status, applied_at) VALUES
    ((SELECT id FROM jobs WHERE title = 'Senior Backend Engineer'),
     (SELECT id FROM users WHERE email = 'alice@example.com'),
     'accepted', '2026-01-16 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'Data Analyst'),
     (SELECT id FROM users WHERE email = 'alice@example.com'),
     'pending',  '2026-01-26 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'Senior Backend Engineer'),
     (SELECT id FROM users WHERE email = 'bob@example.com'),
     'rejected', '2026-01-17 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'Data Analyst'),
     (SELECT id FROM users WHERE email = 'bob@example.com'),
     'rejected', '2026-01-28 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'Frontend Developer'),
     (SELECT id FROM users WHERE email = 'carol@example.com'),
     'accepted', '2026-01-21 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'Product Manager'),
     (SELECT id FROM users WHERE email = 'carol@example.com'),
     'pending',  '2026-02-13 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'DevOps Engineer'),
     (SELECT id FROM users WHERE email = 'david@example.com'),
     'pending',  '2026-02-06 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'Machine Learning Engineer'),
     (SELECT id FROM users WHERE email = 'david@example.com'),
     'rejected', '2026-03-06 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'QA Engineer'),
     (SELECT id FROM users WHERE email = 'emma@example.com'),
     'accepted', '2026-02-21 09:00:00+00'),

    ((SELECT id FROM jobs WHERE title = 'Data Analyst'),
     (SELECT id FROM users WHERE email = 'emma@example.com'),
     'pending',  '2026-01-27 09:00:00+00');
