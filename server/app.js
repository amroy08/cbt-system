const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');
const config = require('./config/config');
const { initDb } = require('./db/database');

const app = express();

// Middleware for parsing requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure session
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: false // Must be false for local HTTP LAN testing without SSL
  }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Redirect root to student login or admin setup checking
app.get('/', (req, res) => {
  res.redirect('/student/login.html');
});

app.get('/admin', (req, res) => {
  res.redirect('/admin/login.html');
});

// Register API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/student', require('./routes/student'));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Express Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Find Local IPv4 Address for LAN display
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // family can be 'IPv4' or 4 depending on Node version
      if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Establish database connection on load
initDb().catch(err => {
  console.error('Failed to initialize database:', err);
});

// Start DB and Express Server
const PORT = config.PORT;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log('================================================================');
    console.log('CBT Server Running');
    console.log(`Admin URL:   http://localhost:${PORT}/admin`);
    console.log(`Student URL: http://${localIp}:${PORT}/student/login.html`);
    console.log(`Local IP:    ${localIp}`);
    console.log('----------------------------------------------------------------');
    console.log('FIREWALL CONFIGURATION NOTE:');
    console.log(`- Ensure Windows Defender Firewall / macOS Firewall allows incoming`);
    console.log(`  connections on port ${PORT} for Node.js.`);
    console.log(`- Student PCs must connect to the same LAN/router/switch.`);
    console.log(`- No internet connection is required.`);
    console.log('================================================================');
  });
}

module.exports = app; // exported for testing

