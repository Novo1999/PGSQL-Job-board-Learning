const express = require('express');
const { listApplications } = require('../controllers/applicationsController');

const router = express.Router();

// GET /api/applications — list all applications
router.get('/', listApplications);

module.exports = router;
