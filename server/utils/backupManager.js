const path = require('path');
const fs = require('fs');
const dbModule = require('../db/database');
const config = require('../config/config');

async function createBackup() {
  const timestamp = new Date().toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '')
    .replace(/-/g, ''); // YYYYMMDD_HHMMSS
  const backupFilename = `cbt_backup_${timestamp}.json`;
  const backupFilepath = path.join(config.BACKUP_PATH, backupFilename);

  if (fs.existsSync(backupFilepath)) {
    throw new Error(`Backup file ${backupFilename} already exists.`);
  }

  // Retrieve data from all models
  const backupData = {
    admins: await dbModule.Admin.find({}).lean(),
    academic_years: await dbModule.AcademicYear.find({}).lean(),
    grades: await dbModule.Grade.find({}).lean(),
    subjects: await dbModule.Subject.find({}).lean(),
    exam_types: await dbModule.ExamType.find({}).lean(),
    exams: await dbModule.Exam.find({}).lean(),
    questions: await dbModule.Question.find({}).lean(),
    candidates: await dbModule.Candidate.find({}).lean(),
    attempts: await dbModule.Attempt.find({}).lean(),
    answers: await dbModule.Answer.find({}).lean(),
    import_batches: await dbModule.ImportBatch.find({}).lean(),
    audit_logs: await dbModule.AuditLog.find({}).lean()
  };

  fs.writeFileSync(backupFilepath, JSON.stringify(backupData, null, 2), 'utf-8');

  return {
    filename: backupFilename,
    filepath: backupFilepath
  };
}

module.exports = {
  createBackup
};
