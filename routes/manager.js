const express = require('express');
const router = express.Router();
const manager = require('../controllers/manager');
const { authenticateUser } = require('../middleware/auth');

router.post('/log', authenticateUser, manager.logVisit);
router.get('/visitors', authenticateUser, manager.getAllVisitors);
router.get('/logs', authenticateUser, manager.getProcessedVisitLogs);
router.get('/requests', authenticateUser, manager.getProcessedVisitRequests);
router.get('/analytics', authenticateUser, manager.getManagerVisitAnalytics);
router.put('/approve/:visit_id', authenticateUser, manager.approveVisitByManager);
router.put('/check-out/:visit_id', authenticateUser, manager.approveExitByManager);

module.exports = router;