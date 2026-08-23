-- ============================================================================
-- Job Board — seed data
-- ============================================================================
-- Run AFTER schema.sql:   psql -d job_board -f sql/seed.sql
--
-- This is a small but deliberately-shaped dataset. It is designed so that real
-- SQL practice is interesting:
--   * a job with NO applications          -> practice LEFT JOIN / "find gaps"
--   * a job with NULL salaries            -> practice NULL handling / COALESCE
--   * a DRAFT job, an EXPIRED job and an ARCHIVED job
--                                         -> practice the "live posting" filter
--   * candidates who applied to several jobs, jobs with several applicants
--   * a full spread of pipeline statuses  -> practice funnels and GROUP BY
--   * skills shared across jobs/candidates -> practice many-to-many matching
--   * a stream of job views over 28 days  -> practice date_trunc / time series
--
-- About the id columns: the tables use GENERATED ALWAYS AS IDENTITY, so we do
-- NOT insert ids ourselves. To wire up relationships we look rows up by their
-- natural/unique columns (email for users, name for companies, title for jobs).
-- The subqueries below are themselves good SQL practice.
--
-- About the dates: rows that only need to be "in the past" use fixed dates so
-- results are reproducible. Anything a *time-sensitive* query depends on
-- (expiry, trending, recent activity) is written relative to now(), so this
-- file still produces interesting results whenever you run it.
-- ============================================================================

-- Start clean so this file can be re-run without piling up duplicate rows.
-- TRUNCATE ... RESTART IDENTITY resets the id counters; CASCADE also clears
-- child tables that reference these.
TRUNCATE application_events, job_views, saved_jobs, job_skills, user_skills,
         applications, jobs, companies, skills, users
    RESTART IDENTITY CASCADE;


-- ----------------------------------------------------------------------------
-- users  (5 candidates, 3 employers)
-- ----------------------------------------------------------------------------
-- Only candidates carry a headline / years_experience; employer rows leave them
-- NULL on purpose, so aggregates over these columns have to think about NULLs.
INSERT INTO users (name, email, role, headline, location, years_experience, created_at) VALUES
    ('Alice Johnson',  'alice@example.com',  'candidate',
        'Backend engineer, distributed systems', 'Remote',            7,
        '2026-01-05 09:00:00+00'),
    ('Bob Smith',      'bob@example.com',    'candidate',
        'Full-stack developer',                  'New York, NY',      4,
        '2026-01-08 14:30:00+00'),
    ('Carol Williams', 'carol@example.com',  'candidate',
        'Product-minded frontend developer',     'San Francisco, CA', 9,
        '2026-02-01 11:15:00+00'),
    ('David Brown',    'david@example.com',  'candidate',
        'Platform / DevOps engineer',            'Austin, TX',        5,
        '2026-02-10 08:45:00+00'),
    ('Emma Davis',     'emma@example.com',   'candidate',
        'Data analyst moving into ML',           'Boston, MA',        2,
        '2026-03-01 16:20:00+00'),
    ('Frank Miller',   'frank@example.com',  'employer',  NULL, NULL, NULL, '2026-01-02 10:00:00+00'),
    ('Grace Lee',      'grace@example.com',  'employer',  NULL, NULL, NULL, '2026-01-03 10:00:00+00'),
    ('Henry Wilson',   'henry@example.com',  'employer',  NULL, NULL, NULL, '2026-01-10 10:00:00+00');


-- ----------------------------------------------------------------------------
-- skills  (14 skills across 3 categories)
-- ----------------------------------------------------------------------------
INSERT INTO skills (name, category) VALUES
    ('PostgreSQL',   'database'),
    ('SQL',          'database'),
    ('Redis',        'database'),
    ('TypeScript',   'language'),
    ('JavaScript',   'language'),
    ('Python',       'language'),
    ('Go',           'language'),
    ('React',        'framework'),
    ('Node.js',      'framework'),
    ('Django',       'framework'),
    ('Docker',       'infrastructure'),
    ('Kubernetes',   'infrastructure'),
    ('AWS',          'infrastructure'),
    ('Terraform',    'infrastructure');


-- ----------------------------------------------------------------------------
-- companies  (4 companies)
-- ----------------------------------------------------------------------------
-- Frank owns two companies: useful for "group a person's companies together".
INSERT INTO companies (owner_id, name, description, website, industry, headquarters, created_at) VALUES
    ((SELECT id FROM users WHERE email = 'frank@example.com'),
        'Acme Corp',        'General-purpose widgets and gadgets.',
        'https://acme.example.com',     'Manufacturing', 'New York, NY',      '2026-01-02 10:00:00+00'),
    ((SELECT id FROM users WHERE email = 'grace@example.com'),
        'Globex Inc',       'Data and analytics products.',
        'https://globex.example.com',   'Analytics',     'Austin, TX',        '2026-01-03 10:00:00+00'),
    ((SELECT id FROM users WHERE email = 'henry@example.com'),
        'Initech',          'Enterprise software and consulting.',
        'https://initech.example.com',  'Software',      'San Francisco, CA', '2026-01-10 10:00:00+00'),
    ((SELECT id FROM users WHERE email = 'frank@example.com'),
        'Umbrella Systems', 'Applied research and machine learning.',
        NULL,                           'Research',      'Boston, MA',        '2026-02-01 10:00:00+00');


-- ----------------------------------------------------------------------------
-- jobs  (11 postings; titles are unique so we can look them up below)
-- ----------------------------------------------------------------------------
-- Read the status / expires_at columns carefully — they are the whole point of
-- this table. Only SEVEN of these eleven rows are actually live right now:
--
--   live      Senior Backend Engineer, Frontend Developer, Data Analyst,
--             DevOps Engineer, Product Manager, Machine Learning Engineer,
--             Junior Backend Engineer
--   NOT live  Technical Writer   (draft — never published)
--             Support Engineer   (open, but expires_at is in the past)
--             QA Engineer        (closed — still has applications)
--             Solutions Architect(archived)
--
-- Any candidate-facing query that forgets
--     status = 'open' AND (expires_at IS NULL OR expires_at > now())
-- will leak the wrong rows, and this data will tell you immediately.
INSERT INTO jobs (company_id, title, description, salary_min, salary_max, location,
                  is_remote, employment_type, experience_level, status,
                  published_at, expires_at, created_at) VALUES

    ((SELECT id FROM companies WHERE name = 'Acme Corp'),
        'Senior Backend Engineer', 'Own our core APIs and data model. Heavy PostgreSQL work.',
        120000, 160000, 'Remote', true, 'full_time', 'senior', 'open',
        now() - interval '25 days', now() + interval '35 days', '2026-01-15 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Acme Corp'),
        'Frontend Developer', 'Build the candidate-facing web app in React and TypeScript.',
        90000, 120000, 'New York, NY', false, 'full_time', 'mid', 'open',
        now() - interval '20 days', now() + interval '40 days', '2026-01-20 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Globex Inc'),
        'Data Analyst', 'Turn product data into insights. SQL every single day.',
        80000, 110000, 'Remote', true, 'full_time', 'mid', 'open',
        now() - interval '18 days', now() + interval '12 days', '2026-01-25 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Globex Inc'),
        'DevOps Engineer', 'Own CI/CD and cloud infrastructure.',
        110000, 150000, 'Austin, TX', false, 'full_time', 'senior', 'open',
        now() - interval '14 days', now() + interval '46 days', '2026-02-05 12:00:00+00'),

    ((SELECT id FROM companies WHERE name = 'Initech'),
        'Product Manager', 'Define the roadmap and priorities.',
        130000, 170000, 'San Francisco, CA', false, 'full_time', 'lead', 'open',
        now() - interval '10 days', NULL, '2026-02-12 12:00:00+00'),

    -- Closed: stopped accepting applications, but its existing applications and
    -- history must still be readable by the employer.
    ((SELECT id FROM companies WHERE name = 'Initech'),
        'QA Engineer', 'Design and run our test strategy.',
        70000, 95000, 'Remote', true, 'part_time', 'mid', 'closed',
        now() - interval '60 days', now() - interval '5 days', '2026-02-20 12:00:00+00'),

    -- Expires in 4 days: the row the "postings expiring soon" query should find.
    ((SELECT id FROM companies WHERE name = 'Umbrella Systems'),
        'Machine Learning Engineer', 'Ship models to production.',
        140000, 190000, 'Boston, MA', false, 'full_time', 'senior', 'open',
        now() - interval '30 days', now() + interval '4 days', '2026-03-05 12:00:00+00'),

    -- Deliberately NULL salaries + no applications: great for practicing NULL
    -- handling and LEFT JOINs.
    ((SELECT id FROM companies WHERE name = 'Umbrella Systems'),
        'Junior Backend Engineer', 'Entry-level role; salary to be discussed.',
        NULL, NULL, 'Remote', true, 'full_time', 'junior', 'open',
        now() - interval '6 days', NULL, '2026-03-10 12:00:00+00'),

    -- Draft: written but never published. published_at MUST stay NULL here —
    -- the jobs_published_has_date CHECK constraint allows that only for drafts.
    ((SELECT id FROM companies WHERE name = 'Acme Corp'),
        'Technical Writer', 'Document the public API. Not published yet.',
        60000, 85000, 'Remote', true, 'contract', 'mid', 'draft',
        NULL, NULL, '2026-03-12 12:00:00+00'),

    -- Open but EXPIRED: the trap. status alone says "open"; expires_at says no.
    ((SELECT id FROM companies WHERE name = 'Globex Inc'),
        'Support Engineer', 'Front-line technical support.',
        55000, 70000, 'Remote', true, 'full_time', 'junior', 'open',
        now() - interval '90 days', now() - interval '2 days', '2026-03-15 12:00:00+00'),

    -- Archived: hidden even from the employer's default dashboard.
    ((SELECT id FROM companies WHERE name = 'Initech'),
        'Solutions Architect', 'Pre-sales architecture for enterprise clients.',
        135000, 175000, 'San Francisco, CA', false, 'full_time', 'lead', 'archived',
        now() - interval '120 days', now() - interval '60 days', '2026-03-18 12:00:00+00');


-- ----------------------------------------------------------------------------
-- job_skills   (what each posting asks for)
-- ----------------------------------------------------------------------------
-- Note the required / nice-to-have mix. "Senior Backend Engineer" requires
-- three skills — no single candidate below holds all three, which makes the
-- strict "matches every required skill" query return an empty set for it. That
-- is the correct answer, and worth seeing.
INSERT INTO job_skills (job_id, skill_id, is_required)
SELECT j.id, s.id, v.is_required
FROM (VALUES
    ('Senior Backend Engineer',   'PostgreSQL', true),
    ('Senior Backend Engineer',   'Go',         true),
    ('Senior Backend Engineer',   'Kubernetes', true),
    ('Senior Backend Engineer',   'Redis',      false),

    ('Frontend Developer',        'React',      true),
    ('Frontend Developer',        'TypeScript', true),
    ('Frontend Developer',        'JavaScript', false),

    ('Data Analyst',              'SQL',        true),
    ('Data Analyst',              'Python',     true),
    ('Data Analyst',              'PostgreSQL', false),

    ('DevOps Engineer',           'Docker',     true),
    ('DevOps Engineer',           'Kubernetes', true),
    ('DevOps Engineer',           'AWS',        true),
    ('DevOps Engineer',           'Terraform',  false),

    ('Product Manager',           'SQL',        false),

    ('QA Engineer',               'TypeScript', true),
    ('QA Engineer',               'Docker',     false),

    ('Machine Learning Engineer', 'Python',     true),
    ('Machine Learning Engineer', 'AWS',        true),
    ('Machine Learning Engineer', 'Docker',     false),

    ('Junior Backend Engineer',   'SQL',        true),
    ('Junior Backend Engineer',   'Node.js',    false),

    ('Technical Writer',          'JavaScript', false),

    ('Support Engineer',          'SQL',        false),

    ('Solutions Architect',       'AWS',        true),
    ('Solutions Architect',       'Kubernetes', false)
) AS v(job_title, skill_name, is_required)
JOIN jobs   j ON j.title = v.job_title
JOIN skills s ON s.name  = v.skill_name;


-- ----------------------------------------------------------------------------
-- user_skills   (what each candidate actually knows)
-- ----------------------------------------------------------------------------
-- Emma deliberately has NO skills recorded: a candidate who matches nothing.
INSERT INTO user_skills (user_id, skill_id, years_experience)
SELECT u.id, s.id, v.years
FROM (VALUES
    ('alice@example.com', 'PostgreSQL', 6),
    ('alice@example.com', 'Go',         4),
    ('alice@example.com', 'SQL',        7),
    ('alice@example.com', 'Docker',     3),
    ('alice@example.com', 'Redis',      2),

    ('bob@example.com',   'TypeScript', 4),
    ('bob@example.com',   'React',      4),
    ('bob@example.com',   'JavaScript', 5),
    ('bob@example.com',   'Node.js',    3),
    ('bob@example.com',   'SQL',        2),

    ('carol@example.com', 'React',      8),
    ('carol@example.com', 'TypeScript', 6),
    ('carol@example.com', 'JavaScript', 9),

    ('david@example.com', 'Docker',     5),
    ('david@example.com', 'Kubernetes', 4),
    ('david@example.com', 'AWS',        5),
    ('david@example.com', 'Terraform',  3),
    ('david@example.com', 'Python',     2)
) AS v(email, skill_name, years)
JOIN users  u ON u.email = v.email
JOIN skills s ON s.name  = v.skill_name;


-- ----------------------------------------------------------------------------
-- applications  (15 applications)
-- ----------------------------------------------------------------------------
-- Only candidates apply. Note that "Junior Backend Engineer" and "Technical
-- Writer" get NO applications on purpose, while "Senior Backend Engineer" and
-- "Data Analyst" get three each.
--
-- There are also applications against a CLOSED job, an EXPIRED job and an
-- ARCHIVED job. That is realistic: a posting closing does not delete the people
-- who already applied, and employer-facing queries must still return them.
INSERT INTO applications (job_id, user_id, status, cover_letter, applied_at, updated_at)
SELECT j.id, u.id, v.status, v.cover_letter, v.applied_at, v.updated_at
FROM (VALUES
    ('Senior Backend Engineer',   'alice@example.com', 'accepted',
        'Six years on PostgreSQL-backed APIs.',
        now() - interval '24 days', now() - interval '6 days'),
    ('Senior Backend Engineer',   'bob@example.com',   'rejected',
        NULL,
        now() - interval '23 days', now() - interval '19 days'),
    ('Senior Backend Engineer',   'david@example.com', 'interview',
        'Platform background, keen to go deeper on backend.',
        now() - interval '21 days', now() - interval '4 days'),

    ('Data Analyst',              'alice@example.com', 'pending',
        NULL,
        now() - interval '17 days', now() - interval '17 days'),
    ('Data Analyst',              'bob@example.com',   'rejected',
        NULL,
        now() - interval '16 days', now() - interval '11 days'),
    ('Data Analyst',              'emma@example.com',  'offer',
        'This is exactly the analytics role I have been aiming for.',
        now() - interval '15 days', now() - interval '2 days'),

    ('Frontend Developer',        'carol@example.com', 'accepted',
        'Nine years of React, most recently design-systems work.',
        now() - interval '19 days', now() - interval '3 days'),
    ('Frontend Developer',        'emma@example.com',  'reviewing',
        NULL,
        now() - interval '12 days', now() - interval '9 days'),

    ('Product Manager',           'carol@example.com', 'pending',
        NULL,
        now() - interval '9 days',  now() - interval '9 days'),

    ('DevOps Engineer',           'david@example.com', 'interview',
        'I have run the exact stack described in the posting.',
        now() - interval '13 days', now() - interval '1 day'),
    ('DevOps Engineer',           'bob@example.com',   'withdrawn',
        NULL,
        now() - interval '12 days', now() - interval '8 days'),

    ('Machine Learning Engineer', 'david@example.com', 'rejected',
        NULL,
        now() - interval '28 days', now() - interval '22 days'),

    -- against a CLOSED posting
    ('QA Engineer',               'emma@example.com',  'accepted',
        NULL,
        now() - interval '55 days', now() - interval '40 days'),

    -- against an EXPIRED posting
    ('Support Engineer',          'alice@example.com', 'pending',
        NULL,
        now() - interval '80 days', now() - interval '80 days'),

    -- against an ARCHIVED posting
    ('Solutions Architect',       'carol@example.com', 'rejected',
        NULL,
        now() - interval '110 days', now() - interval '95 days')
) AS v(job_title, email, status, cover_letter, applied_at, updated_at)
JOIN jobs  j ON j.title = v.job_title
JOIN users u ON u.email = v.email;


-- ----------------------------------------------------------------------------
-- application_events   (the audit trail)
-- ----------------------------------------------------------------------------
-- Step 1: every application starts life with a 'pending' event stamped at the
-- moment it was submitted. Generating this from the applications table itself
-- guarantees the two never disagree.
INSERT INTO application_events (application_id, from_status, to_status, note, created_at)
SELECT a.id, NULL, 'pending', 'Application submitted', a.applied_at
FROM applications a;

-- Step 2: the applications that moved on get their intermediate steps, spaced
-- a few days apart. The final event's timestamp matches applications.updated_at,
-- so "current status" and "last event" always agree — a useful invariant to
-- lean on when you start writing LAG() queries over this table.
INSERT INTO application_events (application_id, from_status, to_status, note, created_at)
SELECT a.id, v.from_status, v.to_status, v.note, v.created_at
FROM (VALUES
    -- Alice -> Senior Backend Engineer: the full happy path, four stages.
    ('Senior Backend Engineer', 'alice@example.com', 'pending',   'reviewing',
        'Strong PostgreSQL background.',      now() - interval '20 days'),
    ('Senior Backend Engineer', 'alice@example.com', 'reviewing', 'interview',
        'Scheduled technical interview.',     now() - interval '15 days'),
    ('Senior Backend Engineer', 'alice@example.com', 'interview', 'offer',
        'Offer extended.',                    now() - interval '9 days'),
    ('Senior Backend Engineer', 'alice@example.com', 'offer',     'accepted',
        'Offer accepted, starts next month.', now() - interval '6 days'),

    -- Bob -> Senior Backend Engineer: rejected straight after review.
    ('Senior Backend Engineer', 'bob@example.com',   'pending',   'reviewing',
        NULL,                                 now() - interval '21 days'),
    ('Senior Backend Engineer', 'bob@example.com',   'reviewing', 'rejected',
        'Not enough systems experience.',     now() - interval '19 days'),

    -- David -> Senior Backend Engineer: still mid-pipeline.
    ('Senior Backend Engineer', 'david@example.com', 'pending',   'reviewing',
        NULL,                                 now() - interval '18 days'),
    ('Senior Backend Engineer', 'david@example.com', 'reviewing', 'interview',
        'First round booked.',                now() - interval '4 days'),

    ('Data Analyst',            'bob@example.com',   'pending',   'reviewing',
        NULL,                                 now() - interval '14 days'),
    ('Data Analyst',            'bob@example.com',   'reviewing', 'rejected',
        NULL,                                 now() - interval '11 days'),

    ('Data Analyst',            'emma@example.com',  'pending',   'reviewing',
        NULL,                                 now() - interval '13 days'),
    ('Data Analyst',            'emma@example.com',  'reviewing', 'interview',
        NULL,                                 now() - interval '8 days'),
    ('Data Analyst',            'emma@example.com',  'interview', 'offer',
        'Offer sent, awaiting reply.',        now() - interval '2 days'),

    ('Frontend Developer',      'carol@example.com', 'pending',   'reviewing',
        NULL,                                 now() - interval '17 days'),
    ('Frontend Developer',      'carol@example.com', 'reviewing', 'interview',
        NULL,                                 now() - interval '12 days'),
    ('Frontend Developer',      'carol@example.com', 'interview', 'offer',
        NULL,                                 now() - interval '7 days'),
    ('Frontend Developer',      'carol@example.com', 'offer',     'accepted',
        NULL,                                 now() - interval '3 days'),

    ('Frontend Developer',      'emma@example.com',  'pending',   'reviewing',
        NULL,                                 now() - interval '9 days'),

    ('DevOps Engineer',         'david@example.com', 'pending',   'reviewing',
        NULL,                                 now() - interval '10 days'),
    ('DevOps Engineer',         'david@example.com', 'reviewing', 'interview',
        'On-site scheduled.',                 now() - interval '1 day'),

    ('DevOps Engineer',         'bob@example.com',   'pending',   'withdrawn',
        'Candidate accepted another offer.',  now() - interval '8 days'),

    ('Machine Learning Engineer', 'david@example.com', 'pending',   'reviewing',
        NULL,                                 now() - interval '26 days'),
    ('Machine Learning Engineer', 'david@example.com', 'reviewing', 'rejected',
        'Looking for deeper ML experience.',  now() - interval '22 days'),

    ('QA Engineer',             'emma@example.com',  'pending',   'interview',
        NULL,                                 now() - interval '50 days'),
    ('QA Engineer',             'emma@example.com',  'interview', 'accepted',
        NULL,                                 now() - interval '40 days'),

    ('Solutions Architect',     'carol@example.com', 'pending',   'rejected',
        'Role put on hold.',                  now() - interval '95 days')
) AS v(job_title, email, from_status, to_status, note, created_at)
JOIN jobs         j ON j.title = v.job_title
JOIN users        u ON u.email = v.email
JOIN applications a ON a.job_id = j.id AND a.user_id = u.id;


-- ----------------------------------------------------------------------------
-- saved_jobs   (candidate bookmarks)
-- ----------------------------------------------------------------------------
-- Alice has saved a job she also applied to, and one she has not. That
-- difference is what makes "saved jobs I have not applied to yet" a real query
-- (NOT EXISTS / LEFT JOIN ... IS NULL) rather than a trivial one.
INSERT INTO saved_jobs (user_id, job_id, saved_at)
SELECT u.id, j.id, v.saved_at
FROM (VALUES
    ('alice@example.com', 'Senior Backend Engineer',   now() - interval '26 days'),
    ('alice@example.com', 'DevOps Engineer',           now() - interval '11 days'),
    ('alice@example.com', 'Machine Learning Engineer', now() - interval '5 days'),
    ('bob@example.com',   'Frontend Developer',        now() - interval '18 days'),
    ('bob@example.com',   'Junior Backend Engineer',   now() - interval '4 days'),
    ('carol@example.com', 'Product Manager',           now() - interval '10 days'),
    ('emma@example.com',  'Data Analyst',              now() - interval '16 days'),
    ('emma@example.com',  'Machine Learning Engineer', now() - interval '2 days')
) AS v(email, job_title, saved_at)
JOIN users u ON u.email = v.email
JOIN jobs  j ON j.title = v.job_title;


-- ----------------------------------------------------------------------------
-- job_views   (the event stream)
-- ----------------------------------------------------------------------------
-- Rather than typing hundreds of rows, we GENERATE them. generate_series() is a
-- set-returning function: joined to jobs with CROSS JOIN LATERAL, it produces N
-- rows per job, where N can depend on that job's own columns.
--
-- Everything here is arithmetic on j.id and g — no random() — so the dataset is
-- identical every time you re-seed and your query results stay reproducible.
--
--   * the view count per job varies      -> "trending" has a real winner
--   * viewed_at spreads over ~28 days    -> date_trunc('day', ...) has gaps
--   * roughly a third of views are NULL  -> COUNT(*) vs COUNT(user_id) differ
--     user_id (logged-out visitors)
INSERT INTO job_views (job_id, user_id, viewed_at)
SELECT
    j.id,
    CASE
        WHEN g % 3 = 0 THEN NULL
        ELSE (SELECT u.id
              FROM users u
              WHERE u.role = 'candidate'
              ORDER BY u.id
              OFFSET (g % 5) LIMIT 1)
    END,
    now()
        - (((g * (j.id + 3)) % 28) * interval '1 day')
        - ((g % 24) * interval '1 hour')
FROM jobs j
CROSS JOIN LATERAL generate_series(1, 8 + ((j.id * 7) % 34)) AS g
WHERE j.status = 'open';

-- Keep the denormalized counter honest. In the application this happens inside
-- the same transaction as the INSERT; here we just recompute it once at the end.
UPDATE jobs j
SET views_count = (SELECT count(*) FROM job_views v WHERE v.job_id = j.id);
