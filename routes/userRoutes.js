const express = require('express');
const router = express.Router();
const { createAccount,getUsers,Login } = require('../controllers/UserController');
// Example route for user registration
router.post('/register',createAccount)
router.get("/allusers",getUsers)
router.post('/login',Login)
module.exports = router;