const express = require('express');
const { listJobs } = require('../controllers/jobsController');

const router = express.Router();

// GET /api/jobs — list all jobs (newest first)
router.get('/', listJobs);

// Add more job routes here as you build features, e.g.:
//   router.get('/:id', getJobById);
//   router.post('/', createJob);

module.exports = router;
