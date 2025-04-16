const express = require('express');
const router = express.Router();
const security = require('../controllers/security');
const { authenticateUser } = require('../middleware/auth');

router.put('/security-approve/:visit_id', authenticateUser, security.approveVisitBySecurity);
router.get('/security-analytics', authenticateUser, security.getSecurityVisitAnalytics);
router.get('/requests', authenticateUser, security.getSecurityRequests);
router.put('/checkout/:visit_log_id', authenticateUser, security.checkoutVisitor);

module.exports = router;
