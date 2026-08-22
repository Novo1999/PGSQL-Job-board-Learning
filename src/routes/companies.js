const express = require('express');
const { listCompanies } = require('../controllers/companiesController');

const router = express.Router();

// GET /api/companies — list all companies
router.get('/', listCompanies);

module.exports = router;
