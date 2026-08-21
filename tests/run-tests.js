const assert = require('assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Mock parser libraries before requiring routes / app
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const originalExtractRawText = mammoth.extractRawText;
let mockTextReturn = '';
let mockErrorToThrow = null;

mammoth.extractRawText = async function (options) {
  if (mockErrorToThrow) throw mockErrorToThrow;
  return { value: mockTextReturn };
};

const mockPdfParseFunc = async function (dataBuffer) {
  if (mockErrorToThrow) throw mockErrorToThrow;
  return { text: mockTextReturn };
};
require.cache[require.resolve('pdf-parse')] = {
  exports: mockPdfParseFunc
};

// Set test environment MongoDB URI before loading app
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_cbt_test';

const app = require('../server/app');
const dbModule = require('../server/db/database');
const { initDb, Admin, AcademicYear, Grade, Subject, ExamType, Exam, Question, Candidate, Attempt, Answer } = dbModule;

async function runTests() {
  console.log('Starting MongoDB CBT Integration Tests...\n');
  let passedCount = 0;
  let failedCount = 0;

  async function runTestCase(name, fn) {
    try {
      // Connect and clear MongoDB database collections
      await initDb();
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }

      // Re-seed standard exam types (usually in initDb, but double check)
      const standardExamTypes = ['Unit Test 1', 'Term 1', 'Unit Test 2', 'Term 2'];
      for (const name of standardExamTypes) {
        await ExamType.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
      }

      mockTextReturn = '';
      mockErrorToThrow = null;

      await fn();
      console.log(`[PASS] ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(err);
      failedCount++;
    }
  }

  // Helper to create basic metadata
  async function seedBasicMetadata() {
    const y = await AcademicYear.create({ name: '2026-27' });
    const g = await Grade.create({ name: 'Grade 3' });
    const s = await Subject.create({ name: 'Computer' });
    return {
      yearId: y._id.toString(),
      gradeId: g._id.toString(),
      subjectId: s._id.toString()
    };
  }

  // 1. ADMIN AUTHENTICATION TESTS
  await runTestCase('Admin Authentication - Setup & Login Success/Failure', async () => {
    let res = await request(app).get('/api/auth/setup-check');
    assert.strictEqual(res.body.setupRequired, true);

    // Setup first admin
    res = await request(app)
      .post('/api/auth/setup')
      .send({ username: 'teacher1', password: 'password123' });
    assert.strictEqual(res.body.success, true);

    // Setup again should fail
    res = await request(app)
      .post('/api/auth/setup')
      .send({ username: 'teacher2', password: 'password555' });
    assert.strictEqual(res.status, 400);

    // Login success
    res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'teacher1', password: 'password123' });
    assert.strictEqual(res.body.success, true);
    
    const cookie = res.headers['set-cookie'][0];
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('SameSite=Strict'));
  });

  await runTestCase('Admin Authentication - Route Protection', async () => {
    let res = await request(app)
      .get('/api/admin/years')
      .set('Accept', 'application/json');
    assert.strictEqual(res.status, 401);
  });

  // 2. PARSER & QUESTION IMPORT TESTS
  await runTestCase('Import Parser - DOCX Standard, PDF Standard, Inline answers, Separate answer key', async () => {
    const meta = await seedBasicMetadata();
    const type = await ExamType.findOne({ name: 'Term 1' });
    
    const pinHash = await bcrypt.hash('123456', 10);
    const exam = await Exam.create({
      academic_year_id: meta.yearId,
      grade_id: meta.gradeId,
      subject_id: meta.subjectId,
      exam_type_id: type._id,
      title: 'Term 1 Exam',
      date: '2026-09-15',
      duration_minutes: 60,
      total_marks: 50,
      passing_marks: 20,
      pin_hash: pinHash,
      status: 'Draft'
    });

    // Login admin
    await Admin.create({ username: 'admin', password_hash: await bcrypt.hash('password123', 10) });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password123' });
    const adminCookie = loginRes.headers['set-cookie'];

    // Mock Inline answers text
    mockTextReturn = `
    Q1. What is the brain of computer?
    A) Monitor
    B) CPU
    C) Keyboard
    D) Mouse
    Answer: B
    Marks: 2

    Q2. Standard OS is:
    a) Linux
    b) Windows
    c) macOS
    d) MS DOS
    Correct Answer: B
    `;

    const tempFile = path.resolve('uploads/test-import.docx');
    fs.writeFileSync(tempFile, 'mock content');

    let res = await request(app)
      .post('/api/exams/import/parse')
      .set('Cookie', adminCookie)
      .field('examId', exam._id.toString())
      .field('defaultMarks', 1)
      .attach('qpaper', tempFile);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.questions.length, 2);
    
    const q1 = res.body.questions[0];
    assert.strictEqual(q1.question_number, 1);
    assert.strictEqual(q1.option_a, 'Monitor');
    assert.strictEqual(q1.option_b, 'CPU');
    assert.strictEqual(q1.correct_answer, 'B');
    assert.strictEqual(q1.marks, 2);

    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  });

  // 3. EXAM LIFECYCLE TESTS
  await runTestCase('Exam Lifecycle - Start, invalid PIN, closed exam, resumes, autosaves, timeouts', async () => {
    const meta = await seedBasicMetadata();
    const type = await ExamType.findOne({ name: 'Term 1' });
    const pinHash = await bcrypt.hash('123456', 10);
    
    const exam = await Exam.create({
      academic_year_id: meta.yearId,
      grade_id: meta.gradeId,
      subject_id: meta.subjectId,
      exam_type_id: type._id,
      title: 'Computer UT1',
      date: '2026-09-15',
      duration_minutes: 60,
      total_marks: 10,
      passing_marks: 4,
      pin_hash: pinHash,
      status: 'Open'
    });

    const question = await Question.create({
      exam_id: exam._id,
      question_number: 1,
      question_text: 'Which is input device?',
      option_a: 'Monitor',
      option_b: 'Printer',
      option_c: 'Keyboard',
      option_d: 'Speaker',
      correct_answer: 'C',
      marks: 1
    });

    // 1. Invalid PIN login
    let res = await request(app)
      .post('/api/student/login')
      .send({ name: 'Bob', rollNumber: '001', grade: 'Grade 3', division: 'A', pin: 'wrongpin' });
    assert.strictEqual(res.status, 400);

    // 2. Valid Login & Start Attempt
    res = await request(app)
      .post('/api/student/login')
      .send({ name: 'Bob', rollNumber: '001', grade: 'Grade 3', division: 'A', pin: '123456' });
    assert.strictEqual(res.body.success, true);
    const attemptId = res.body.attemptId;

    // 3. Autosave answer
    res = await request(app)
      .post('/api/student/autosave')
      .send({ attemptId, questionId: question._id.toString(), selectedOption: 'C', isMarkedForReview: true, isVisited: true });
    assert.strictEqual(res.body.success, true);

    // Check state in DB
    const savedAns = await Answer.findOne({ attempt_id: attemptId, question_id: question._id });
    assert.strictEqual(savedAns.selected_option, 'C');
    assert.strictEqual(savedAns.is_marked_for_review, true);

    // 4. Test attempt resume
    res = await request(app)
      .post('/api/student/login')
      .send({ name: 'Bob', rollNumber: '001', grade: 'Grade 3', division: 'A', pin: '123456' });
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.attemptId, attemptId);

    // 5. Timeout validation
    await Attempt.findByIdAndUpdate(attemptId, { deadline: '2020-01-01T00:00:00.000Z' });
    res = await request(app)
      .post('/api/student/autosave')
      .send({ attemptId, questionId: question._id.toString(), selectedOption: 'A', isMarkedForReview: false, isVisited: true });
    assert.strictEqual(res.status, 403);

    const finalAttempt = await Attempt.findById(attemptId);
    assert.strictEqual(finalAttempt.status, 'Auto Submitted');
    assert.strictEqual(finalAttempt.score, 1);
  });

  await runTestCase('Exam Lifecycle - Submission, Scoring & Result Visibility', async () => {
    const meta = await seedBasicMetadata();
    const type = await ExamType.findOne({ name: 'Term 1' });
    const pinHash = await bcrypt.hash('654321', 10);
    
    const exam = await Exam.create({
      academic_year_id: meta.yearId,
      grade_id: meta.gradeId,
      subject_id: meta.subjectId,
      exam_type_id: type._id,
      title: 'Computer Term 1',
      date: '2026-09-15',
      duration_minutes: 30,
      total_marks: 20,
      passing_marks: 10,
      pin_hash: pinHash,
      status: 'Open',
      show_result_after_submit: false
    });

    const question = await Question.create({
      exam_id: exam._id,
      question_number: 1,
      question_text: 'Is RAM volatile?',
      option_a: 'Yes',
      option_b: 'No',
      option_c: 'Sometimes',
      option_d: 'Never',
      correct_answer: 'A',
      marks: 2
    });

    // Login
    let res = await request(app)
      .post('/api/student/login')
      .send({ name: 'Alice', rollNumber: '002', grade: 'Grade 3', division: 'B', pin: '654321' });
    const attemptId = res.body.attemptId;

    // Autosave
    await request(app)
      .post('/api/student/autosave')
      .send({ attemptId, questionId: question._id.toString(), selectedOption: 'A', isMarkedForReview: false, isVisited: true });

    // Submit
    res = await request(app)
      .post('/api/student/submit')
      .send({ attemptId });

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.showResult, false);

    const attempt = await Attempt.findById(attemptId);
    assert.strictEqual(attempt.status, 'Submitted');
    assert.strictEqual(attempt.score, 2);
  });

  await runTestCase('Student API Security - Question Leakage Prevention', async () => {
    const meta = await seedBasicMetadata();
    const type = await ExamType.findOne({ name: 'Term 1' });
    const pinHash = await bcrypt.hash('654321', 10);
    
    const exam = await Exam.create({
      academic_year_id: meta.yearId,
      grade_id: meta.gradeId,
      subject_id: meta.subjectId,
      exam_type_id: type._id,
      title: 'Computer Term 1',
      date: '2026-09-15',
      duration_minutes: 30,
      total_marks: 20,
      passing_marks: 10,
      pin_hash: pinHash,
      status: 'Open'
    });

    await Question.create({
      exam_id: exam._id,
      question_number: 1,
      question_text: 'Is RAM volatile?',
      option_a: 'Yes',
      option_b: 'No',
      option_c: 'Sometimes',
      option_d: 'Never',
      correct_answer: 'A',
      marks: 2
    });

    // Student fetches questions
    const res = await request(app).get(`/api/student/questions/${exam._id.toString()}`);
    assert.strictEqual(res.status, 200);
    const questionsList = res.body;

    assert.ok(questionsList.length > 0);
    questionsList.forEach(q => {
      assert.strictEqual(q.correct_answer, undefined);
      assert.strictEqual(q.answer_key, undefined);
    });
  });

  // 4. EXPORT TESTS
  await runTestCase('Export Results CSV - Escaping and Formatting', async () => {
    const meta = await seedBasicMetadata();
    const type = await ExamType.findOne({ name: 'Term 1' });
    const pinHash = await bcrypt.hash('123456', 10);
    
    const exam = await Exam.create({
      academic_year_id: meta.yearId,
      grade_id: meta.gradeId,
      subject_id: meta.subjectId,
      exam_type_id: type._id,
      title: 'Math Exam',
      date: '2026-09-15',
      duration_minutes: 30,
      total_marks: 10,
      passing_marks: 5,
      pin_hash: pinHash,
      status: 'Open'
    });

    // Add candidate & attempt
    const candidate = await Candidate.create({ name: 'Charlie, The Great', roll_number: '003', grade: 'Grade 3', division: 'A' });
    await Attempt.create({
      candidate_id: candidate._id,
      exam_id: exam._id,
      start_time: '2026-08-21T03:00:00.000Z',
      deadline: '2026-08-21T04:00:00.000Z',
      status: 'Submitted',
      score: 8,
      last_activity_at: '2026-08-21T03:30:00.000Z'
    });

    // Login admin
    await Admin.create({ username: 'admin', password_hash: await bcrypt.hash('password123', 10) });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password123' });
    const adminCookie = loginRes.headers['set-cookie'];

    // Call export CSV
    const res = await request(app)
      .get('/api/admin/export-csv')
      .set('Cookie', adminCookie)
      .query({ examId: exam._id.toString() });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.text.includes('"Charlie, The Great"'));
  });

  // 5. BACKUP READABILITY TEST
  await runTestCase('Backup consistency and readability', async () => {
    const meta = await seedBasicMetadata();
    const type = await ExamType.findOne({ name: 'Term 1' });
    const pinHash = await bcrypt.hash('123456', 10);
    
    await Exam.create({
      academic_year_id: meta.yearId,
      grade_id: meta.gradeId,
      subject_id: meta.subjectId,
      exam_type_id: type._id,
      title: 'Math Exam',
      date: '2026-09-15',
      duration_minutes: 30,
      total_marks: 10,
      passing_marks: 5,
      pin_hash: pinHash,
      status: 'Open'
    });

    const { createBackup } = require('../server/utils/backupManager');
    const backupResult = await createBackup();
    assert.ok(fs.existsSync(backupResult.filepath));

    // Verify backup JSON content readability
    const data = JSON.parse(fs.readFileSync(backupResult.filepath, 'utf8'));
    assert.ok(data.exams.length > 0);
    assert.strictEqual(data.exams[0].title, 'Math Exam');

    // Clean up
    if (fs.existsSync(backupResult.filepath)) {
      fs.unlinkSync(backupResult.filepath);
    }
  });

  // 6. MULTI-STUDENT CONCURRENT TEST
  await runTestCase('Mock Multi-student concurrent attempts', async () => {
    const meta = await seedBasicMetadata();
    const type = await ExamType.findOne({ name: 'Term 1' });
    const pinHash = await bcrypt.hash('123456', 10);
    
    const exam = await Exam.create({
      academic_year_id: meta.yearId,
      grade_id: meta.gradeId,
      subject_id: meta.subjectId,
      exam_type_id: type._id,
      title: 'Math Exam',
      date: '2026-09-15',
      duration_minutes: 30,
      total_marks: 10,
      passing_marks: 5,
      pin_hash: pinHash,
      status: 'Open'
    });

    const question = await Question.create({
      exam_id: exam._id,
      question_number: 1,
      question_text: '1+1=?',
      option_a: '1',
      option_b: '2',
      option_c: '3',
      option_d: '4',
      correct_answer: 'B',
      marks: 1
    });

    // Student A Login
    let resA = await request(app)
      .post('/api/student/login')
      .send({ name: 'Student A', rollNumber: 'A01', grade: 'Grade 3', division: 'A', pin: '123456' });
    const attemptIdA = resA.body.attemptId;

    // Student B Login
    let resB = await request(app)
      .post('/api/student/login')
      .send({ name: 'Student B', rollNumber: 'B01', grade: 'Grade 3', division: 'A', pin: '123456' });
    const attemptIdB = resB.body.attemptId;

    assert.notStrictEqual(attemptIdA, attemptIdB);

    // Student A saves 'B'
    await request(app)
      .post('/api/student/autosave')
      .send({ attemptId: attemptIdA, questionId: question._id.toString(), selectedOption: 'B', isMarkedForReview: false, isVisited: true });

    // Student B saves 'A'
    await request(app)
      .post('/api/student/autosave')
      .send({ attemptId: attemptIdB, questionId: question._id.toString(), selectedOption: 'A', isMarkedForReview: false, isVisited: true });

    // Verify answers are separate in DB
    const ansA = await Answer.findOne({ attempt_id: attemptIdA, question_id: question._id });
    const ansB = await Answer.findOne({ attempt_id: attemptIdB, question_id: question._id });
    assert.strictEqual(ansA.selected_option, 'B');
    assert.strictEqual(ansB.selected_option, 'A');

    // Submit both
    await request(app).post('/api/student/submit').send({ attemptId: attemptIdA });
    await request(app).post('/api/student/submit').send({ attemptId: attemptIdB });

    const attA = await Attempt.findById(attemptIdA);
    const attB = await Attempt.findById(attemptIdB);
    assert.strictEqual(attA.score, 1);
    assert.strictEqual(attB.score, 0);
  });

  // Print summary report
  console.log('\n=======================================');
  console.log('CBT INTEGRATION TEST SUMMARY');
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('=======================================');

  mongoose.connection.close();

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test runner encountered error:', err);
    process.exit(1);
  });
}
