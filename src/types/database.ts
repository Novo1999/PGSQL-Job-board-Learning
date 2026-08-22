// PostgreSQL BIGINT values are returned as strings by node-postgres by default.
export type DbId = string;

export type UserRole = 'candidate' | 'employer';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface UserRow {
  id: DbId;
  name: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

export interface CompanyRow {
  id: DbId;
  name: string;
  description: string | null;
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
  created_at: Date;
}

export interface ApplicationRow {
  id: DbId;
  job_id: DbId;
  user_id: DbId;
  status: ApplicationStatus;
  applied_at: Date;
}
