// ============================================================================
// api-examples.ts — the hand-written half of the Postman collection
// ============================================================================
// `npm run postman` reads the *routes* and *controllers* to discover every
// endpoint, its query parameters and its documentation. Everything it cannot
// infer from the source lives here:
//
//   - a friendlier request name than the handler name
//   - example request bodies (a POST body is not visible in a route file)
//   - example values for filters that are optional in code but useful to send
//   - extra variants of one route (e.g. DELETE /api/jobs/:id with ?hard=true)
//
// Keep this file small. If something CAN be derived from the source, derive it
// there instead — that is what stops the collection drifting from the code.
// ============================================================================

/** A value for one query parameter, plus whether Postman sends it by default. */
export type ParamExample = string | { value: string; enabled?: boolean };

export interface RequestExample {
  /** Overrides the auto-generated "Browse Jobs" style name. */
  name?: string;
  /** Query-parameter values, keyed by parameter name. */
  params?: Record<string, ParamExample>;
  /** Example JSON body, written as a real object — it is stringified for you. */
  body?: unknown;
  /** Additional requests hitting the same route with different parameters. */
  variants?: RequestExample[];
}

// ---------------------------------------------------------------------------
// Collection variables. Postman shows these at the top of the collection so a
// reader can point every request at a different server or row without editing
// 60 URLs.
// ---------------------------------------------------------------------------
export const COLLECTION_VARIABLES: Array<{ key: string; value: string }> = [
  { key: 'baseUrl', value: 'http://localhost:3000' },
  { key: 'userId', value: '1' },
  { key: 'companyId', value: '1' },
  { key: 'jobId', value: '1' },
  { key: 'applicationId', value: '1' },
  { key: 'skillId', value: '1' },
];

// ---------------------------------------------------------------------------
// Which collection variable stands in for a path parameter, per folder. The
// routers all call the main resource id ":id", so the folder is what tells us
// whether that id is a job, a user or a company.
// ---------------------------------------------------------------------------
export const PATH_VARIABLES: Record<string, Record<string, string>> = {
  Jobs: { id: 'jobId' },
  Users: { id: 'userId', userId: 'userId', jobId: 'jobId' },
  'Saved Jobs': { userId: 'userId', jobId: 'jobId' },
  Companies: { id: 'companyId' },
  Applications: { id: 'applicationId' },
  Skills: { id: 'skillId' },
};

// ---------------------------------------------------------------------------
// Folder names, in the order they should appear in Postman. Anything not
// listed here is appended in the order the routers register it.
// ---------------------------------------------------------------------------
export const FOLDER_ORDER = [
  'Health',
  'Jobs',
  'Users',
  'Saved Jobs',
  'Companies',
  'Applications',
  'Skills',
  'Analytics',
];

// ---------------------------------------------------------------------------
// Which controller belongs in which folder. Saved jobs are the odd one out:
// they are registered inside the users router but are their own resource.
// ---------------------------------------------------------------------------
export const CONTROLLER_FOLDERS: Record<string, string> = {
  jobsController: 'Jobs',
  usersController: 'Users',
  savedJobsController: 'Saved Jobs',
  companiesController: 'Companies',
  applicationsController: 'Applications',
  skillsController: 'Skills',
  analyticsController: 'Analytics',
};

// ---------------------------------------------------------------------------
// Routes that are not in a router file. /health lives directly on the app.
// ---------------------------------------------------------------------------
export const STANDALONE_REQUESTS: Array<{
  folder: string;
  name: string;
  method: string;
  path: string;
  description: string;
}> = [
  {
    folder: 'Health',
    name: 'Health Check',
    method: 'GET',
    path: '/health',
    description:
      'Liveness probe. Runs `SELECT 1` against the pool, so a 200 means the API is up **and** PostgreSQL is reachable. Answers `{"status":"ok","db":"connected"}`. Start here when something else returns a 500.',
  },
];

// ---------------------------------------------------------------------------
// Per-handler overrides, keyed by the exported controller function name.
// ---------------------------------------------------------------------------
export const EXAMPLES: Record<string, RequestExample> = {
  // -- Jobs -----------------------------------------------------------------
  browseJobs: {
    name: 'Browse Jobs (public board)',
    params: { q: 'engineer' },
  },
  getTrendingJobs: { name: 'Trending Jobs' },
  getExpiringJobs: { name: 'Expiring Jobs' },
  listCompanyJobsForEmployer: {
    name: 'Employer Job Dashboard',
    params: { company_id: '{{companyId}}' },
  },
  getJobById: { name: 'Get Job' },
  getSimilarJobs: { name: 'Similar Jobs' },
  getJobSkills: { name: 'Job Skills' },
  listJobApplicants: {
    // The source default is 'newest'; 'match' is the interesting one to try.
    name: 'Job Applicants',
    params: { sort: 'match' },
  },
  getJobViewStats: { name: 'Job View Stats' },
  createJob: {
    name: 'Create Job (draft)',
    body: {
      company_id: '{{companyId}}',
      title: 'Staff Backend Engineer',
      description: 'Own the data model.',
      salary_min: 150000,
      salary_max: 190000,
      location: 'Remote',
      is_remote: true,
      employment_type: 'full_time',
      experience_level: 'lead',
    },
  },
  updateJob: {
    name: 'Update Job',
    body: { title: 'Senior Backend Engineer (updated)', salary_max: 175000 },
  },
  setJobSkills: {
    name: 'Set Job Skills',
    body: {
      skills: [
        { skill_id: '1', is_required: true },
        { skill_id: '2', is_required: false },
      ],
    },
  },
  recordJobView: { name: 'Record Job View', body: { user_id: '{{userId}}' } },
  publishJob: { name: 'Publish Job', body: { duration_days: 30 } },
  closeJob: { name: 'Close Job', body: {} },
  deleteJob: {
    name: 'Archive Job (soft delete)',
    params: { hard: { value: 'false', enabled: false } },
    variants: [
      {
        name: 'Delete Job (hard, cascades)',
        params: { hard: { value: 'true', enabled: true } },
      },
    ],
  },

  // -- Users ----------------------------------------------------------------
  listUsers: { name: 'List Users' },
  searchCandidates: {
    // match=all is relational division: candidates holding EVERY listed skill.
    name: 'Search Candidates by Skill',
    params: { skill: '1,2', match: 'all' },
  },
  getUserById: { name: 'Get User' },
  getUserSkills: { name: 'User Skills' },
  listUserApplications: { name: 'User Applications' },
  getUserDashboard: { name: 'Candidate Dashboard' },
  getRecommendedJobs: { name: 'Recommended Jobs' },
  createUser: {
    name: 'Create User',
    body: {
      name: 'Ivy Chen',
      email: 'ivy@example.com',
      role: 'candidate',
      headline: 'Backend engineer',
      location: 'Remote',
      years_experience: 5,
    },
  },
  updateUser: {
    name: 'Update User',
    body: { headline: 'Senior backend engineer', location: 'Berlin' },
  },
  setUserSkills: {
    name: 'Set User Skills',
    body: {
      skills: [
        { skill_id: '1', years_experience: 6 },
        { skill_id: '2', years_experience: 3 },
      ],
    },
  },
  deactivateUser: { name: 'Deactivate User', body: {} },
  deleteUser: { name: 'Delete User (hard, cascades)' },

  // -- Saved jobs -----------------------------------------------------------
  listSavedJobs: { name: 'List Saved Jobs' },
  saveJob: { name: 'Save Job', body: { job_id: '{{jobId}}' } },
  unsaveJob: { name: 'Unsave Job' },

  // -- Companies ------------------------------------------------------------
  listCompanies: { name: 'List Companies' },
  getTopHiringCompanies: { name: 'Top Hiring Companies' },
  getCompanyById: { name: 'Get Company' },
  listCompanyJobs: { name: 'Company Jobs' },
  getCompanyFunnel: { name: 'Company Hiring Funnel' },
  getCompanySalaryBands: { name: 'Company Salary Bands' },
  createCompany: {
    // owner_id 6 is Frank, an employer in the seed data. A candidate id here
    // is meant to be rejected — and that check belongs in the SQL.
    name: 'Create Company',
    body: {
      owner_id: '6',
      name: 'Hooli',
      description: 'Definitely not evil.',
      website: 'https://hooli.example.com',
      industry: 'Software',
      headquarters: 'Palo Alto, CA',
    },
  },
  updateCompany: { name: 'Update Company', body: { description: 'Updated description.' } },
  deleteCompany: { name: 'Delete Company' },

  // -- Applications ---------------------------------------------------------
  listApplications: {
    name: 'List Applications (employer inbox)',
    params: { company_id: '{{companyId}}' },
  },
  getApplicationFunnel: { name: 'Application Funnel' },
  getApplicationById: { name: 'Get Application' },
  getApplicationTimeline: { name: 'Application Timeline' },
  applyToJob: {
    name: 'Apply to Job',
    body: {
      job_id: '{{jobId}}',
      user_id: '{{userId}}',
      cover_letter: 'I would love to work on this.',
      resume_url: 'https://example.com/cv.pdf',
    },
  },
  updateApplicationStatus: {
    name: 'Update Application Status',
    body: { status: 'reviewing', note: 'Strong PostgreSQL background.' },
  },
  withdrawApplication: {
    name: 'Withdraw Application',
    body: { user_id: '{{userId}}', note: 'Accepted another offer.' },
  },
  bulkRejectApplications: {
    name: 'Bulk Reject Applications',
    body: { application_ids: ['1', '2', '3'], note: 'Role has been filled.' },
  },
  deleteApplication: { name: 'Delete Application' },

  // -- Skills ---------------------------------------------------------------
  listSkills: { name: 'List / Autocomplete Skills', params: { q: 'post' } },
  getSkillDemand: { name: 'Skill Demand vs Supply' },
  createSkill: { name: 'Create Skill (upsert)', body: { name: 'Rust', category: 'language' } },
  deleteSkill: { name: 'Delete Skill' },

  // -- Analytics ------------------------------------------------------------
  getOverview: { name: 'Platform Overview' },
  getSalaryBenchmarks: { name: 'Salary Benchmarks' },
  getApplicationsOverTime: { name: 'Applications Over Time' },
  getTopJobsPerCompany: { name: 'Top Jobs Per Company' },
  getConversionRates: { name: 'Conversion Rates' },
  getTimeToHire: { name: 'Time To Hire' },
};
