const express = require('express');
const router = express.Router();
const auth = require('../controllers/auth');
const {  authenticateUser } = require('../middleware/auth');

router.post('/register', auth.register);
router.post('/login', auth.login);
router.get('/user', authenticateUser, auth.getUserDetails);

module.exports = router;
