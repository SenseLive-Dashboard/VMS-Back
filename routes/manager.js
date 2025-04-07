const express = require('express');
const router = express.Router();
const manager = require('../controllers/manager');
const { authenticateUser } = require('../middleware/auth');

router.post('/log', authenticateUser, manager.logVisit);
router.get('/visitors', authenticateUser, manager.getAllVisitors);
router.get('/logs', authenticateUser, manager.getAllVisitLogs);
router.get('/visit-logs/unplanned', authenticateUser, manager.getUnplannedVisitsByUser);

module.exports = router;
