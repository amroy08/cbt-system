const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAdmin } = require('../middleware/authMiddleware');
const { AcademicYear, Grade, Subject, ExamType, Exam, Question, Candidate, Attempt, Answer, AuditLog, Admin } = require('../db/database');
const { createBackup } = require('../utils/backupManager');
const { logEvent } = require('../utils/auditLogger');
const config = require('../config/config');

router.use(requireAdmin);

// 1. ACADEMIC YEARS
router.get('/years', async (req, res) => {
  try {
    const rows = await AcademicYear.find({}).sort({ name: -1 });
    res.json(rows.map(r => ({ id: r._id, name: r.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/years', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    const doc = await AcademicYear.create({ name: name.trim() });
    await logEvent('CREATE_YEAR', req.session.adminId, `Created academic year: ${name.trim()}`, req.ip);
    res.json({ id: doc._id, name: doc.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create academic year (may already exist)' });
  }
});

// 2. GRADES
router.get('/grades', async (req, res) => {
  try {
    const rows = await Grade.find({}).sort({ name: 1 });
    res.json(rows.map(r => ({ id: r._id, name: r.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/grades', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    const doc = await Grade.create({ name: name.trim() });
    await logEvent('CREATE_GRADE', req.session.adminId, `Created grade: ${name.trim()}`, req.ip);
    res.json({ id: doc._id, name: doc.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create grade (may already exist)' });
  }
});

// 3. SUBJECTS
router.get('/subjects', async (req, res) => {
  try {
    const rows = await Subject.find({}).sort({ name: 1 });
    res.json(rows.map(r => ({ id: r._id, name: r.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/subjects', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    const doc = await Subject.create({ name: name.trim() });
    await logEvent('CREATE_SUBJECT', req.session.adminId, `Created subject: ${name.trim()}`, req.ip);
    res.json({ id: doc._id, name: doc.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create subject (may already exist)' });
  }
});

// 4. EXAM TYPES
router.get('/exam-types', async (req, res) => {
  try {
    const rows = await ExamType.find({}).sort({ name: 1 });
    res.json(rows.map(r => ({ id: r._id, name: r.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. MONITORING CANDIDATES
router.get('/monitor/:examId', async (req, res) => {
  try {
    const examId = req.params.examId;
    
    // Fetch attempts and populate candidates
    const attempts = await Attempt.find({ exam_id: examId })
      .populate('candidate_id')
      .lean();

    const now = Date.now();
    const candidateRows = attempts.map((a) => {
      const c = a.candidate_id;
      let liveStatus = a.status; // 'Submitted' or 'Auto Submitted'
      if (a.status === 'In Exam') {
        const lastActTime = Date.parse(a.last_activity_at);
        if (now - lastActTime < 30 * 1000) {
          liveStatus = 'Active';
        } else {
          liveStatus = 'Inactive/Disconnected';
        }
      }

      let remainingSec = 0;
      if (a.status === 'In Exam') {
        remainingSec = Math.max(0, Math.round((Date.parse(a.deadline) - now) / 1000));
      }

      return {
        roll_number: c ? c.roll_number : '-',
        name: c ? c.name : 'Unknown Candidate',
        grade: c ? c.grade : '-',
        division: c ? c.division : '-',
        start_time: a.start_time,
        remaining_seconds: remainingSec,
        last_activity_at: a.last_activity_at,
        status: liveStatus
      };
    }).sort((a, b) => a.roll_number.localeCompare(b.roll_number));

    const counts = {
      total: candidateRows.length,
      active: candidateRows.filter(r => r.status === 'Active').length,
      inactive: candidateRows.filter(r => r.status === 'Inactive/Disconnected').length,
      submitted: candidateRows.filter(r => r.status === 'Submitted').length,
      autoSubmitted: candidateRows.filter(r => r.status === 'Auto Submitted').length
    };

    res.json({ counts, candidates: candidateRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force-submit an active attempt (Teacher override)
router.post('/monitor/force-submit/:examId/:rollNumber', async (req, res) => {
  try {
    const { examId, rollNumber } = req.params;
    
    // Find candidate first
    const candidate = await Candidate.findOne({ roll_number: rollNumber });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // Find active attempt
    const attempt = await Attempt.findOne({ exam_id: examId, candidate_id: candidate._id });
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    if (attempt.status !== 'In Exam') {
      return res.status(400).json({ error: 'Attempt is already finalized' });
    }

    // scoring
    const questions = await Question.find({ exam_id: examId });
    const answers = await Answer.find({ attempt_id: attempt._id });

    const answersMap = {};
    answers.forEach(ans => {
      answersMap[ans.question_id.toString()] = ans.selected_option;
    });

    let score = 0;
    questions.forEach(q => {
      const selected = answersMap[q._id.toString()];
      if (selected === q.correct_answer) {
        score += q.marks;
      }
    });

    const nowStr = new Date().toISOString();
    attempt.status = 'Submitted';
    attempt.submission_type = 'admin-forced';
    attempt.submitted_at = nowStr;
    attempt.score = score;
    attempt.last_activity_at = nowStr;
    await attempt.save();

    await logEvent('FORCE_SUBMIT', req.session.adminId, `Force submitted exam ID ${examId} for Roll No ${rollNumber}. Score: ${score}`, req.ip);

    res.json({ success: true, score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. RESULTS DASHBOARD WITH FILTERS
router.get('/results', async (req, res) => {
  try {
    const { examId, division } = req.query;
    if (!examId) {
      return res.status(400).json({ error: 'examId filter is required' });
    }

    // Query attempts populated with candidate
    const attempts = await Attempt.find({ exam_id: examId })
      .populate('candidate_id')
      .lean();

    // Filter by division on application level
    let filteredAttempts = attempts;
    if (division && division.trim() !== '') {
      const normDiv = division.trim().toUpperCase();
      filteredAttempts = attempts.filter(a => a.candidate_id && a.candidate_id.division === normDiv);
    }

    const questions = await Question.find({ exam_id: examId });
    const examTotalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

    const results = [];
    for (const a of filteredAttempts) {
      const answers = await Answer.find({ attempt_id: a._id });
      const ansMap = {};
      answers.forEach(ans => {
        ansMap[ans.question_id.toString()] = ans.selected_option;
      });

      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;

      questions.forEach((q) => {
        const sel = ansMap[q._id.toString()];
        if (!sel) {
          unanswered++;
        } else if (sel === q.correct_answer) {
          correct++;
        } else {
          incorrect++;
        }
      });

      const percentage = examTotalMarks > 0 ? ((a.score / examTotalMarks) * 100).toFixed(2) : 0;
      const c = a.candidate_id;

      results.push({
        roll_number: c ? c.roll_number : '-',
        name: c ? c.name : 'Unknown',
        grade: c ? c.grade : '-',
        division: c ? c.division : '-',
        attempted: correct + incorrect,
        correct,
        incorrect,
        unanswered,
        score: a.score,
        total_marks: examTotalMarks,
        percentage: parseFloat(percentage),
        status: a.status,
        submission_type: a.submission_type || '-',
        start_time: a.start_time,
        submitted_at: a.submitted_at || '-'
      });
    }

    results.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV helper to escape values safely
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }
  return str;
}

// 7. CSV EXPORT
router.get('/export-csv', async (req, res) => {
  try {
    const { examId, division } = req.query;
    if (!examId) {
      return res.status(400).json({ error: 'examId filter is required' });
    }

    const exam = await Exam.findById(examId)
      .populate('academic_year_id')
      .populate('grade_id')
      .populate('subject_id')
      .populate('exam_type_id')
      .lean();

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const attempts = await Attempt.find({ exam_id: examId })
      .populate('candidate_id')
      .lean();

    let filteredAttempts = attempts;
    if (division && division.trim() !== '') {
      const normDiv = division.trim().toUpperCase();
      filteredAttempts = attempts.filter(a => a.candidate_id && a.candidate_id.division === normDiv);
    }

    const questions = await Question.find({ exam_id: examId });
    const examTotalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

    const headers = [
      'Roll Number', 'Student Name', 'Grade', 'Division',
      'Attempted', 'Correct', 'Incorrect', 'Unanswered',
      'Marks Obtained', 'Total Marks', 'Percentage',
      'Status', 'Submission Type', 'Start Time', 'Submitted At'
    ];

    let csvContent = headers.join(',') + '\n';

    for (const a of filteredAttempts) {
      const answers = await Answer.find({ attempt_id: a._id });
      const ansMap = {};
      answers.forEach(ans => {
        ansMap[ans.question_id.toString()] = ans.selected_option;
      });

      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;

      questions.forEach((q) => {
        const sel = ansMap[q._id.toString()];
        if (!sel) {
          unanswered++;
        } else if (sel === q.correct_answer) {
          correct++;
        } else {
          incorrect++;
        }
      });

      const percentage = examTotalMarks > 0 ? ((a.score / examTotalMarks) * 100).toFixed(2) : 0;
      const c = a.candidate_id;

      const row = [
        c ? c.roll_number : '-',
        c ? c.name : 'Unknown',
        c ? c.grade : '-',
        c ? c.division : '-',
        correct + incorrect,
        correct,
        incorrect,
        unanswered,
        a.score,
        examTotalMarks,
        percentage,
        a.status,
        a.submission_type || '-',
        a.start_time,
        a.submitted_at || '-'
      ];

      csvContent += row.map(escapeCSV).join(',') + '\n';
    }

    // Build filename
    const yearSafe = exam.academic_year_id.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const gradeSafe = exam.grade_id.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const subjectSafe = exam.subject_id.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const typeSafe = exam.exam_type_id.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const dateSafe = exam.date;
    const filename = `${yearSafe}_${gradeSafe}_${subjectSafe}_${typeSafe}_results_${dateSafe}.csv`;

    await logEvent('EXPORT_RESULTS', req.session.adminId, `Exported CSV results for Exam ID ${examId}`, req.ip);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. BACKUPS
router.post('/backups', async (req, res) => {
  try {
    const backup = await createBackup();
    await logEvent('CREATE_BACKUP', req.session.adminId, `Created MongoDB JSON backup: ${backup.filename}`, req.ip);
    res.json({ success: true, filename: backup.filename });
  } catch (err) {
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

router.get('/backups', async (req, res) => {
  try {
    if (!fs.existsSync(config.BACKUP_PATH)) {
      return res.json([]);
    }
    const files = fs.readdirSync(config.BACKUP_PATH);
    const backups = files
      .filter(f => f.startsWith('cbt_backup_') && f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(config.BACKUP_PATH, f));
        return {
          filename: f,
          size: stats.size,
          created_at: stats.mtime
        };
      })
      .sort((a, b) => b.created_at - a.created_at);

    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. AUDIT LOGS
router.get('/audit-logs', async (req, res) => {
  try {
    const rows = await AuditLog.find({})
      .populate('admin_id')
      .sort({ created_at: -1 })
      .limit(100)
      .lean();

    res.json(rows.map(r => ({
      created_at: r.created_at,
      event_type: r.event_type,
      username: r.admin_id ? r.admin_id.username : null,
      ip_address: r.ip_address,
      details: r.details
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
