import express from 'express';
import {
  browseJobs,
  closeJob,
  createJob,
  deleteJob,
  getExpiringJobs,
  getJobById,
  getJobSkills,
  getJobViewStats,
  getSimilarJobs,
  getTrendingJobs,
  listCompanyJobsForEmployer,
  listJobApplicants,
  publishJob,
  recordJobView,
  setJobSkills,
  updateJob,
} from '../controllers/jobsController.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// ORDER MATTERS. Express matches routes in the order they are registered, and
// '/:id' matches literally anything — including the string "trending". Every
// literal path must therefore be declared BEFORE the parameterised ones, or
// GET /api/jobs/trending ends up in getJobById looking for a job with the id
// "trending", and PostgreSQL rejects it as an invalid bigint.
// ---------------------------------------------------------------------------
router.get('/trending', getTrendingJobs);
router.get('/expiring', getExpiringJobs);
router.get('/manage', listCompanyJobsForEmployer);

// Public board + posting creation.
router.get('/', browseJobs);
router.post('/', createJob);

// A single posting.
router.get('/:id', getJobById);
router.patch('/:id', updateJob);
router.delete('/:id', deleteJob);

// Sub-resources of a posting.
router.get('/:id/similar', getSimilarJobs);
router.get('/:id/skills', getJobSkills);
router.put('/:id/skills', setJobSkills);
router.get('/:id/applications', listJobApplicants);
router.get('/:id/views', getJobViewStats);
router.post('/:id/view', recordJobView);

// Lifecycle transitions. POST rather than PATCH: these are actions with rules,
// not field edits.
router.post('/:id/publish', publishJob);
router.post('/:id/close', closeJob);

export default router;
