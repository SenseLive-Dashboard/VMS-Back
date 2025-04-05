const express = require('express');
const router = express.Router();
const admin = require('../controllers/admin');
const {  authenticateUser } = require('../middleware/auth');

router.get('/users', authenticateUser, admin.getUsers);
router.get('/departments', authenticateUser, admin.getAllDepartments);
router.get('/analytics', admin.getVisitAnalytics);

module.exports = router;
