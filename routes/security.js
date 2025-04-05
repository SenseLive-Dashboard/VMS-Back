const express = require('express');
const router = express.Router();
const security = require('../controllers/security');
const { authenticateUser } = require('../middleware/auth');

router.post('/security-approve/:visit_id', authenticateUser, security.approveVisitBySecurity);

module.exports = router;
