const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../middleware/authMiddleware');
const { Exam, Question, Attempt } = require('../db/database');
const { parseQuestionPaper, importQuestionsTransaction } = require('../services/questionImportService');
const { logEvent } = require('../utils/auditLogger');
const config = require('../config/config');

// Configure Multer for secure file upload
const uploadDir = config.UPLOADS_PATH;
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('Multer upload directory creation skipped:', err.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'qpaper-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.docx' || ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .docx and .pdf files are supported.'));
    }
  }
});

router.use(requireAdmin);

// 1. GET ALL EXAMS WITH METADATA
router.get('/', async (req, res) => {
  try {
    const exams = await Exam.find({})
      .populate('academic_year_id')
      .populate('grade_id')
      .populate('subject_id')
      .populate('exam_type_id')
      .lean();

    const result = [];
    for (const ex of exams) {
      const qCount = await Question.countDocuments({ exam_id: ex._id });
      result.push({
        id: ex._id.toString(),
        title: ex.title,
        date: ex.date,
        duration_minutes: ex.duration_minutes,
        total_marks: ex.total_marks,
        passing_marks: ex.passing_marks,
        status: ex.status,
        show_result_after_submit: ex.show_result_after_submit ? 1 : 0,
        academic_year: ex.academic_year_id ? ex.academic_year_id.name : '-',
        grade: ex.grade_id ? ex.grade_id.name : '-',
        subject: ex.subject_id ? ex.subject_id.name : '-',
        exam_type: ex.exam_type_id ? ex.exam_type_id.name : '-',
        question_count: qCount
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET SINGLE EXAM (Exclude PIN Hash)
router.get('/:id', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    
    res.json({
      id: exam._id.toString(),
      title: exam.title,
      date: exam.date,
      duration_minutes: exam.duration_minutes,
      total_marks: exam.total_marks,
      passing_marks: exam.passing_marks,
      status: exam.status,
      instructions: exam.instructions,
      show_result_after_submit: exam.show_result_after_submit ? 1 : 0,
      academic_year_id: exam.academic_year_id.toString(),
      grade_id: exam.grade_id.toString(),
      subject_id: exam.subject_id.toString(),
      exam_type_id: exam.exam_type_id.toString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CREATE EXAM
router.post('/', async (req, res) => {
  try {
    const {
      academic_year_id,
      grade_id,
      subject_id,
      exam_type_id,
      title,
      date,
      duration_minutes,
      total_marks,
      passing_marks,
      pin,
      instructions,
      status,
      show_result_after_submit
    } = req.body;

    if (!academic_year_id || !grade_id || !subject_id || !exam_type_id || !title || !date || !duration_minutes || !total_marks || !pin) {
      return res.status(400).json({ error: 'Missing required exam fields' });
    }

    if (parseInt(duration_minutes, 10) <= 0 || parseInt(total_marks, 10) <= 0) {
      return res.status(400).json({ error: 'Duration and Total Marks must be greater than 0.' });
    }

    const pinHash = await bcrypt.hash(pin.trim(), 10);

    const doc = await Exam.create({
      academic_year_id,
      grade_id,
      subject_id,
      exam_type_id,
      title: title.trim(),
      date,
      duration_minutes: parseInt(duration_minutes, 10),
      total_marks: parseInt(total_marks, 10),
      passing_marks: parseInt(passing_marks, 10) || 0,
      pin_hash: pinHash,
      instructions: instructions || '',
      status: status || 'Draft',
      show_result_after_submit: show_result_after_submit ? true : false
    });

    await logEvent('CREATE_EXAM', req.session.adminId, `Created exam ID ${doc._id}: ${title.trim()}`, req.ip);

    res.json({ success: true, examId: doc._id.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. UPDATE EXAM
router.put('/:id', async (req, res) => {
  try {
    const {
      academic_year_id,
      grade_id,
      subject_id,
      exam_type_id,
      title,
      date,
      duration_minutes,
      total_marks,
      passing_marks,
      pin,
      instructions,
      status,
      show_result_after_submit
    } = req.body;

    const examId = req.params.id;

    if (!academic_year_id || !grade_id || !subject_id || !exam_type_id || !title || !date || !duration_minutes || !total_marks) {
      return res.status(400).json({ error: 'Missing required exam fields' });
    }

    if (parseInt(duration_minutes, 10) <= 0 || parseInt(total_marks, 10) <= 0) {
      return res.status(400).json({ error: 'Duration and Total Marks must be greater than 0.' });
    }

    const updateFields = {
      academic_year_id,
      grade_id,
      subject_id,
      exam_type_id,
      title: title.trim(),
      date,
      duration_minutes: parseInt(duration_minutes, 10),
      total_marks: parseInt(total_marks, 10),
      passing_marks: parseInt(passing_marks, 10) || 0,
      instructions: instructions || '',
      status: status || 'Draft',
      show_result_after_submit: show_result_after_submit ? true : false
    };

    if (pin && pin.trim() !== '') {
      updateFields.pin_hash = await bcrypt.hash(pin.trim(), 10);
    }

    await Exam.findByIdAndUpdate(examId, updateFields);

    await logEvent('UPDATE_EXAM', req.session.adminId, `Updated exam ID ${examId}: ${title.trim()}`, req.ip);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE EXAM
router.delete('/:id', async (req, res) => {
  try {
    const examId = req.params.id;
    // Check if any attempts exist
    const attemptCount = await Attempt.countDocuments({ exam_id: examId });
    if (attemptCount > 0) {
      return res.status(400).json({ error: 'Cannot delete exam. Students have already attempted this exam.' });
    }

    await Exam.findByIdAndDelete(examId);
    await Question.deleteMany({ exam_id: examId });
    
    await logEvent('DELETE_EXAM', req.session.adminId, `Deleted exam ID ${examId}`, req.ip);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. UPLOAD AND PARSE QUESTION PAPER (Preview phase)
router.post('/import/parse', upload.single('qpaper'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const tempFilePath = req.file.path;
  const originalFilename = req.file.originalname;
  const fileExt = path.extname(originalFilename).toLowerCase();

  try {
    const { examId, defaultMarks } = req.body;
    if (!examId) {
      throw new Error('Exam ID is required.');
    }

    const marks = parseInt(defaultMarks, 10) || 1;
    const questions = await parseQuestionPaper(tempFilePath, fileExt, marks, examId);

    // Delete temp file after successful parse
    fs.unlinkSync(tempFilePath);

    res.json({
      success: true,
      filename: originalFilename,
      questions
    });
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    res.status(400).json({ error: err.message });
  }
});

// 7. CONFIRM AND COMMIT IMPORT
router.post('/import/confirm', async (req, res) => {
  try {
    const { examId, questions, filename } = req.body;
    if (!examId || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing examId or questions list' });
    }

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const result = await importQuestionsTransaction(examId, questions, filename || 'Manual Upload', exam);

    await logEvent(
      'IMPORT_QUESTIONS', 
      req.session.adminId, 
      `Imported ${result.importedCount} questions, skipped ${result.skippedCount} for exam ID ${examId}`, 
      req.ip
    );

    res.json({
      success: true,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import questions: ' + err.message });
  }
});

// 8. GET QUESTIONS FOR SINGLE EXAM
router.get('/:id/questions', async (req, res) => {
  try {
    const rows = await Question.find({ exam_id: req.params.id }).sort({ question_number: 1 });
    res.json(rows.map(r => ({
      id: r._id.toString(),
      question_number: r.question_number,
      question_text: r.question_text,
      option_a: r.option_a,
      option_b: r.option_b,
      option_c: r.option_c,
      option_d: r.option_d,
      correct_answer: r.correct_answer,
      marks: r.marks
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
