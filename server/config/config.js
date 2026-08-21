const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || 'cbt_default_secret_key',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/school_cbt',
  UPLOAD_LIMIT: process.env.UPLOAD_LIMIT || '10mb',
  BACKUP_PATH: path.resolve(process.env.BACKUP_PATH || 'backups'),
  SCHOOL_NAME: process.env.SCHOOL_NAME || 'Local School CBT Center'
};
