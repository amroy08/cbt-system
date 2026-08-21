const path = require('path');
const os = require('os');
require('dotenv').config();

const isVercel = !!process.env.VERCEL;
const tempDir = os.tmpdir();

module.exports = {
  PORT: process.env.PORT || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || 'cbt_default_secret_key',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/school_cbt',
  UPLOAD_LIMIT: process.env.UPLOAD_LIMIT || '10mb',
  BACKUP_PATH: isVercel ? path.join(tempDir, 'backups') : path.resolve(process.env.BACKUP_PATH || 'backups'),
  UPLOADS_PATH: isVercel ? path.join(tempDir, 'uploads') : path.resolve('uploads'),
  EXPORTS_PATH: isVercel ? path.join(tempDir, 'exports') : path.resolve('exports'),
  SCHOOL_NAME: process.env.SCHOOL_NAME || 'Local School CBT Center'
};

