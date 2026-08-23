import express from 'express';
import {
  createUser,
  deactivateUser,
  deleteUser,
  getRecommendedJobs,
  getUserById,
  getUserDashboard,
  getUserSkills,
  listUserApplications,
  listUsers,
  searchCandidates,
  setUserSkills,
  updateUser,
} from '../controllers/usersController.js';
import {
  listSavedJobs,
  saveJob,
  unsaveJob,
} from '../controllers/savedJobsController.js';

const router = express.Router();

// Literal paths first — see the note in routes/jobs.ts.
router.get('/candidates/search', searchCandidates);

router.get('/', listUsers);
router.post('/', createUser);

router.get('/:id', getUserById);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);
router.post('/:id/deactivate', deactivateUser);

router.get('/:id/skills', getUserSkills);
router.put('/:id/skills', setUserSkills);
router.get('/:id/applications', listUserApplications);
router.get('/:id/dashboard', getUserDashboard);
router.get('/:id/recommended-jobs', getRecommendedJobs);

// Saved jobs are owned by a user, so they are nested under one. The parameter
// is named :userId here (not :id) because savedJobsController reads it under
// that name — Express only passes along what the path pattern declares.
router.get('/:userId/saved-jobs', listSavedJobs);
router.post('/:userId/saved-jobs', saveJob);
router.delete('/:userId/saved-jobs/:jobId', unsaveJob);

export default router;
