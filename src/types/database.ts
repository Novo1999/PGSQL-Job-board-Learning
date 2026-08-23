// ============================================================================
// Database types
// ============================================================================
// Two node-postgres facts drive the choices in this file:
//
//   1. BIGINT is returned as a STRING, not a number. JavaScript numbers cannot
//      hold every BIGINT value, so the driver refuses to lose precision. Every
//      id is therefore `DbId` (= string).
//
//   2. count(), sum(), avg(), percentile_cont() and friends also come back as
//      strings — count() returns BIGINT, and avg()/percentile_cont() return
//      NUMERIC, which has the same precision problem. Aggregate columns below
//      are typed `DbCount` / `DbNumeric` for that reason. Call Number(...) at
//      the point of use if you need arithmetic.
// ============================================================================

// PostgreSQL BIGINT values are returned as strings by node-postgres by default.
export type DbId = string;

// A count()/sum() result: BIGINT over the wire, therefore a string.
export type DbCount = string;

// An avg()/percentile_cont() result: NUMERIC over the wire, therefore a string.
// Nullable because averaging zero rows (or only NULLs) yields NULL, not 0.
export type DbNumeric = string | null;

export type UserRole = 'candidate' | 'employer';

export type JobStatus = 'draft' | 'open' | 'closed' | 'archived';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship';

export type ExperienceLevel = 'junior' | 'mid' | 'senior' | 'lead';

// The hiring pipeline, in the order candidates move through it.
export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'interview'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

// Runtime copies of the unions above, for validating request input.
export const USER_ROLES = ['candidate', 'employer'] as const;
export const JOB_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship'] as const;
export const EXPERIENCE_LEVELS = ['junior', 'mid', 'senior', 'lead'] as const;
export const APPLICATION_STATUSES = [
  'pending',
  'reviewing',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

// ----------------------------------------------------------------------------
// Table rows — one interface per table, mirroring sql/schema.sql exactly.
// ----------------------------------------------------------------------------

export interface UserRow {
  id: DbId;
  name: string;
  email: string;
  role: UserRole;
  headline: string | null;
  location: string | null;
  years_experience: number | null;
  is_active: boolean;
  created_at: Date;
}

export interface SkillRow {
  id: DbId;
  name: string;
  category: string | null;
  created_at: Date;
}

export interface CompanyRow {
  id: DbId;
  owner_id: DbId | null;
  name: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  headquarters: string | null;
  created_at: Date;
}

export interface JobRow {
  id: DbId;
  company_id: DbId;
  title: string;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  location: string | null;
  is_remote: boolean;
  employment_type: EmploymentType;
  experience_level: ExperienceLevel | null;
  status: JobStatus;
  views_count: number;
  published_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApplicationRow {
  id: DbId;
  job_id: DbId;
  user_id: DbId;
  status: ApplicationStatus;
  cover_letter: string | null;
  resume_url: string | null;
  applied_at: Date;
  updated_at: Date;
}

export interface ApplicationEventRow {
  id: DbId;
  application_id: DbId;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  note: string | null;
  created_at: Date;
}

export interface JobSkillRow {
  job_id: DbId;
  skill_id: DbId;
  is_required: boolean;
}

export interface UserSkillRow {
  user_id: DbId;
  skill_id: DbId;
  years_experience: number | null;
}

export interface SavedJobRow {
  user_id: DbId;
  job_id: DbId;
  saved_at: Date;
}

export interface JobViewRow {
  id: DbId;
  job_id: DbId;
  user_id: DbId | null;
  viewed_at: Date;
}

// ----------------------------------------------------------------------------
// Request bodies
// ----------------------------------------------------------------------------

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  headline?: string | null;
  location?: string | null;
  years_experience?: number | null;
}

export type UpdateUserInput = Partial<CreateUserInput>;

export interface CreateCompanyInput {
  name: string;
  owner_id: DbId;
  description?: string | null;
  website?: string | null;
  industry?: string | null;
  headquarters?: string | null;
}

export type UpdateCompanyInput = Partial<Omit<CreateCompanyInput, 'owner_id'>>;

export interface CreateJobInput {
  company_id: DbId;
  title: string;
  description?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  location?: string | null;
  is_remote?: boolean;
  employment_type?: EmploymentType;
  experience_level?: ExperienceLevel | null;
}

export type UpdateJobInput = Partial<CreateJobInput>;

export interface PublishJobInput {
  // How many days the posting should stay live. Omit for "never expires".
  duration_days?: number | null;
}

export interface CreateApplicationInput {
  job_id: DbId;
  user_id: DbId;
  cover_letter?: string | null;
  resume_url?: string | null;
}

export interface UpdateApplicationStatusInput {
  status: ApplicationStatus;
  note?: string | null;
}

export interface BulkRejectInput {
  application_ids: DbId[];
  note?: string | null;
}

export interface SetJobSkillsInput {
  skills: Array<{ skill_id: DbId; is_required?: boolean }>;
}

export interface SetUserSkillsInput {
  skills: Array<{ skill_id: DbId; years_experience?: number | null }>;
}

export interface CreateSkillInput {
  name: string;
  category?: string | null;
}

export interface SaveJobInput {
  job_id: DbId;
}

export interface RecordJobViewInput {
  // NULL for a logged-out visitor.
  user_id?: DbId | null;
}

// ----------------------------------------------------------------------------
// Projection rows — the shape each hand-written query is expected to return.
// ----------------------------------------------------------------------------
// These are not tables. Treat each one as the column list your SELECT has to
// produce (aliases included) for the controller that uses it to type-check.

// One row of the public job board listing.
export interface JobListItemRow {
  id: DbId;
  title: string;
  company_id: DbId;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  employment_type: EmploymentType;
  experience_level: ExperienceLevel | null;
  salary_min: number | null;
  salary_max: number | null;
  published_at: Date | null;
  expires_at: Date | null;
  application_count: DbCount;
  // The total number of rows that matched, before paging was applied, so the
  // client knows how many pages there are.
  total_count: DbCount;
}

// A single posting, joined to its company and its aggregates.
export interface JobDetailRow extends JobRow {
  company_name: string;
  company_description: string | null;
  company_website: string | null;
  application_count: DbCount;
  saved_count: DbCount;
}

// A skill attached to a job, resolved to its name.
export interface JobSkillDetailRow {
  skill_id: DbId;
  name: string;
  category: string | null;
  is_required: boolean;
}

// A skill attached to a user, resolved to its name.
export interface UserSkillDetailRow {
  skill_id: DbId;
  name: string;
  category: string | null;
  years_experience: number | null;
}

// A candidate's own application list: the application plus what it points at.
export interface CandidateApplicationRow {
  id: DbId;
  status: ApplicationStatus;
  applied_at: Date;
  updated_at: Date;
  job_id: DbId;
  job_title: string;
  job_status: JobStatus;
  company_id: DbId;
  company_name: string;
  total_count: DbCount;
}

// An employer looking at one job's applicants.
export interface JobApplicantRow {
  id: DbId;
  status: ApplicationStatus;
  applied_at: Date;
  updated_at: Date;
  cover_letter: string | null;
  resume_url: string | null;
  user_id: DbId;
  candidate_name: string;
  candidate_email: string;
  candidate_headline: string | null;
  candidate_location: string | null;
  years_experience: number | null;
  // How many of this job's REQUIRED skills the candidate holds, and how many
  // there are in total — the raw material for a match percentage.
  matched_required_skills: DbCount;
  total_required_skills: DbCount;
  total_count: DbCount;
}

// One step of an application's history, with the gap since the previous step.
export interface ApplicationTimelineRow {
  id: DbId;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  note: string | null;
  created_at: Date;
  // How long the application spent at the previous stage. Empty for the first
  // event, which has nothing before it.
  days_since_previous: DbNumeric;
}

export interface CompanyListItemRow {
  id: DbId;
  name: string;
  description: string | null;
  industry: string | null;
  headquarters: string | null;
  owner_id: DbId | null;
  owner_name: string | null;
  open_jobs_count: DbCount;
  total_count: DbCount;
}

export interface CompanyDetailRow extends CompanyRow {
  owner_name: string | null;
  owner_email: string | null;
  open_jobs_count: DbCount;
  total_jobs_count: DbCount;
  application_count: DbCount;
  avg_salary_min: DbNumeric;
  avg_salary_max: DbNumeric;
}

// One bucket of a status funnel: how many applications sit at this stage.
export interface FunnelStageRow {
  status: ApplicationStatus;
  application_count: DbCount;
  // This stage's share of the total, 0-100.
  pct_of_total: DbNumeric;
}

// A company's postings ranked by pay, against that company's own average.
export interface SalaryBandRow {
  job_id: DbId;
  title: string;
  salary_min: number | null;
  salary_max: number | null;
  experience_level: ExperienceLevel | null;
  salary_rank: DbCount;
  // salary_max minus the company's own average salary_max.
  diff_from_company_avg: DbNumeric;
}

export interface TopCompanyRow {
  id: DbId;
  name: string;
  open_jobs_count: DbCount;
  application_count: DbCount;
  hired_count: DbCount;
}

// A candidate returned by employer-side search.
export interface CandidateMatchRow {
  id: DbId;
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  years_experience: number | null;
  matched_skills: DbCount;
  // Which of the searched-for skills this candidate actually has.
  matched_skill_names: string[];
  total_count: DbCount;
}

// A job recommended to a candidate, scored by skill overlap.
export interface RecommendedJobRow {
  id: DbId;
  title: string;
  company_id: DbId;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  published_at: Date | null;
  matched_skills: DbCount;
  required_skills: DbCount;
  // matched_skills as a percentage of required_skills.
  match_pct: DbNumeric;
}

export interface SavedJobListItemRow {
  job_id: DbId;
  saved_at: Date;
  title: string;
  company_id: DbId;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  status: JobStatus;
  expires_at: Date | null;
  is_live: boolean;
  has_applied: boolean;
  total_count: DbCount;
}

export interface CandidateDashboardRow {
  total_applications: DbCount;
  active_applications: DbCount;
  interviews: DbCount;
  offers: DbCount;
  rejections: DbCount;
  saved_jobs: DbCount;
}

export interface TrendingJobRow {
  id: DbId;
  title: string;
  company_id: DbId;
  company_name: string;
  recent_views: DbCount;
  recent_applications: DbCount;
  // Views in the window vs. views in the window immediately before it.
  previous_views: DbCount;
  trend_pct: DbNumeric;
}

export interface ExpiringJobRow {
  id: DbId;
  title: string;
  company_id: DbId;
  company_name: string;
  expires_at: Date;
  days_left: DbNumeric;
  application_count: DbCount;
}

// One day/week/month bucket of a time series. Buckets with no activity must
// still appear, with a zero.
export interface TimeSeriesPointRow {
  bucket: Date;
  total: DbCount;
}

export interface JobViewStatsRow {
  bucket: Date;
  views: DbCount;
  unique_viewers: DbCount;
  anonymous_views: DbCount;
}

export interface SkillDemandRow {
  id: DbId;
  name: string;
  category: string | null;
  // How many LIVE jobs ask for it vs. how many candidates list it.
  job_count: DbCount;
  candidate_count: DbCount;
  // job_count - candidate_count: positive means unmet demand.
  demand_gap: DbNumeric;
}

export interface SalaryBenchmarkRow {
  grouping_key: string;
  sample_size: DbCount;
  p25_salary_max: DbNumeric;
  median_salary_max: DbNumeric;
  p75_salary_max: DbNumeric;
  min_salary_min: number | null;
  max_salary_max: number | null;
}

export interface OverviewStatsRow {
  total_users: DbCount;
  total_candidates: DbCount;
  total_employers: DbCount;
  total_companies: DbCount;
  live_jobs: DbCount;
  draft_jobs: DbCount;
  closed_jobs: DbCount;
  total_applications: DbCount;
  applications_last_7_days: DbCount;
  avg_applications_per_live_job: DbNumeric;
  jobs_with_no_applications: DbCount;
}

export interface CompanyTopJobRow {
  company_id: DbId;
  company_name: string;
  job_id: DbId;
  title: string;
  application_count: DbCount;
  rank_in_company: DbCount;
}
