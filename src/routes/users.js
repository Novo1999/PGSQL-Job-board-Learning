const express = require('express');
const { listUsers } = require('../controllers/usersController');

const router = express.Router();

// GET /api/users — list all users
router.get('/', listUsers);

module.exports = router;
