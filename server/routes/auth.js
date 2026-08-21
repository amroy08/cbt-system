const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Admin } = require('../db/database');
const { logEvent } = require('../utils/auditLogger');

// Check if setup is needed (no admins exist)
router.get('/setup-check', async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    return res.json({ setupRequired: count === 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Database check failed' });
  }
});

// Setup first admin
router.post('/setup', async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count > 0) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    const { username, password } = req.body;
    if (!username || !password || username.trim() === '' || password.trim().length < 6) {
      return res.status(400).json({ error: 'Username is required and password must be at least 6 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newAdmin = await Admin.create({
      username: username.trim(),
      password_hash: passwordHash
    });

    await logEvent('ADMIN_SETUP', newAdmin._id, `Admin created: ${username.trim()}`, req.ip);

    return res.json({ success: true, message: 'First admin created successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Setup failed: ' + err.message });
  }
});

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username: username.trim() });
    if (!admin) {
      await logEvent('LOGIN_FAIL', null, `Failed login attempt for username: ${username}`, req.ip);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      await logEvent('LOGIN_FAIL', null, `Failed login attempt for username: ${username}`, req.ip);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Session regeneration for session fixation protection
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session regeneration failed' });
      }
      req.session.adminId = admin._id.toString();
      req.session.username = admin.username;
      
      logEvent('LOGIN_SUCCESS', admin._id, `Admin logged in: ${admin.username}`, req.ip);
      return res.json({ success: true, message: 'Login successful' });
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// Admin Logout
router.post('/logout', (req, res) => {
  if (req.session) {
    const adminId = req.session.adminId;
    const username = req.session.username;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      if (adminId) {
        logEvent('LOGOUT', adminId, `Admin logged out: ${username}`, req.ip);
      }
      res.clearCookie('connect.sid');
      return res.json({ success: true, message: 'Logged out successfully' });
    });
  } else {
    return res.json({ success: true });
  }
});

module.exports = router;
