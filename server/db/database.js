const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// Ensure parent directories exist
if (!fs.existsSync(config.BACKUP_PATH)) {
  fs.mkdirSync(config.BACKUP_PATH, { recursive: true });
}
if (!fs.existsSync(path.resolve('uploads'))) {
  fs.mkdirSync(path.resolve('uploads'), { recursive: true });
}
if (!fs.existsSync(path.resolve('exports'))) {
  fs.mkdirSync(path.resolve('exports'), { recursive: true });
}

// 1. SCHEMAS
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const academicYearSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  created_at: { type: Date, default: Date.now }
});

const gradeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  created_at: { type: Date, default: Date.now }
});

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  created_at: { type: Date, default: Date.now }
});

const examTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  created_at: { type: Date, default: Date.now }
});

const examSchema = new mongoose.Schema({
  academic_year_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  grade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
  subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  exam_type_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', required: true },
  title: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  duration_minutes: { type: Number, required: true, min: 1 },
  total_marks: { type: Number, required: true, min: 1 },
  passing_marks: { type: Number, required: true, min: 0 },
  pin_hash: { type: String, required: true },
  instructions: { type: String },
  status: { type: String, required: true, enum: ['Draft', 'Open', 'Closed'], default: 'Draft' },
  show_result_after_submit: { type: Boolean, required: true, default: false },
  created_at: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
  exam_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  question_number: { type: Number, required: true },
  question_text: { type: String, required: true },
  option_a: { type: String, required: true },
  option_b: { type: String, required: true },
  option_c: { type: String, required: true },
  option_d: { type: String, required: true },
  correct_answer: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },
  marks: { type: Number, required: true, min: 1, default: 1 },
  created_at: { type: Date, default: Date.now }
});
questionSchema.index({ exam_id: 1, question_number: 1 }, { unique: true });

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  roll_number: { type: String, required: true },
  grade: { type: String, required: true },
  division: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});
candidateSchema.index({ roll_number: 1, grade: 1, division: 1 }, { unique: true });

const attemptSchema = new mongoose.Schema({
  candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  exam_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  start_time: { type: String, required: true },
  deadline: { type: String, required: true },
  status: { type: String, required: true, enum: ['In Exam', 'Submitted', 'Auto Submitted'], default: 'In Exam' },
  submission_type: { type: String, enum: ['manual', 'timeout', 'admin-forced', null], default: null },
  submitted_at: { type: String },
  score: { type: Number, default: 0 },
  last_activity_at: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});
attemptSchema.index({ candidate_id: 1, exam_id: 1 }, { unique: true });

const answerSchema = new mongoose.Schema({
  attempt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true },
  question_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  selected_option: { type: String, enum: ['A', 'B', 'C', 'D', null], default: null },
  is_marked_for_review: { type: Boolean, default: false },
  is_visited: { type: Boolean, default: false },
  updated_at: { type: Date, default: Date.now }
});
answerSchema.index({ attempt_id: 1, question_id: 1 }, { unique: true });

const importBatchSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  academic_year_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  grade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade' },
  subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  exam_type_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType' },
  exam_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
  detected_count: { type: Number, required: true },
  imported_count: { type: Number, required: true },
  skipped_count: { type: Number, required: true },
  status: { type: String, required: true, enum: ['Completed', 'Partial', 'Canceled'] },
  created_at: { type: Date, default: Date.now }
});

const auditLogSchema = new mongoose.Schema({
  event_type: { type: String, required: true },
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  details: { type: String, required: true },
  ip_address: { type: String },
  created_at: { type: Date, default: Date.now }
});

// MODELS
const Admin = mongoose.model('Admin', adminSchema);
const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);
const Grade = mongoose.model('Grade', gradeSchema);
const Subject = mongoose.model('Subject', subjectSchema);
const ExamType = mongoose.model('ExamType', examTypeSchema);
const Exam = mongoose.model('Exam', examSchema);
const Question = mongoose.model('Question', questionSchema);
const Candidate = mongoose.model('Candidate', candidateSchema);
const Attempt = mongoose.model('Attempt', attemptSchema);
const Answer = mongoose.model('Answer', answerSchema);
const ImportBatch = mongoose.model('ImportBatch', importBatchSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// Connection helper
async function initDb() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.MONGODB_URI);
  }

  // Seed standard exam types
  const standardExamTypes = ['Unit Test 1', 'Term 1', 'Unit Test 2', 'Term 2'];
  for (const name of standardExamTypes) {
    await ExamType.findOneAndUpdate(
      { name },
      { name },
      { upsert: true, new: true }
    );
  }
}

module.exports = {
  mongoose,
  initDb,
  Admin,
  AcademicYear,
  Grade,
  Subject,
  ExamType,
  Exam,
  Question,
  Candidate,
  Attempt,
  Answer,
  ImportBatch,
  AuditLog
};
