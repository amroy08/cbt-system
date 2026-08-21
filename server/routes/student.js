const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Exam, Question, Candidate, Attempt, Answer } = require('../db/database');
const { logEvent } = require('../utils/auditLogger');

// 1. STUDENT LOGIN & ATTEMPT START/RESUME
router.post('/login', async (req, res) => {
  try {
    const { name, rollNumber, grade, division, pin } = req.body;
    if (!name || !rollNumber || !grade || !division || !pin) {
      return res.status(400).json({ error: 'All fields (Name, Roll Number, Grade, Division, Exam PIN) are required.' });
    }

    const normRoll = rollNumber.trim().toUpperCase();
    const normGrade = grade.trim().toLowerCase();
    const normDiv = division.trim().toUpperCase();

    // Find Open exams
    const openExams = await Exam.find({ status: 'Open' }).populate('grade_id');

    let matchedExam = null;
    for (const exam of openExams) {
      const match = await bcrypt.compare(pin.trim(), exam.pin_hash);
      if (match) {
        if (exam.grade_id && exam.grade_id.name.toLowerCase() === normGrade) {
          matchedExam = exam;
          break;
        }
      }
    }

    if (!matchedExam) {
      return res.status(400).json({ error: 'Invalid Exam PIN or Grade mismatch.' });
    }

    // Find or create Candidate
    let candidate = await Candidate.findOne({ roll_number: normRoll, grade: grade.trim(), division: normDiv });
    if (!candidate) {
      candidate = await Candidate.create({
        name: name.trim(),
        roll_number: normRoll,
        grade: grade.trim(),
        division: normDiv
      });
    }

    const nowStr = new Date().toISOString();

    // Check if attempt exists
    let attempt = await Attempt.findOne({ candidate_id: candidate._id, exam_id: matchedExam._id });
    if (attempt) {
      if (attempt.status !== 'In Exam') {
        return res.status(400).json({ 
          error: 'You have already submitted this examination.',
          alreadySubmitted: true 
        });
      }

      const deadlineTime = Date.parse(attempt.deadline);
      if (Date.now() > deadlineTime) {
        await finalizeAttempt(attempt._id, 'timeout');
        return res.status(400).json({ 
          error: 'Your exam time has expired and your attempt has been submitted.',
          alreadySubmitted: true
        });
      }

      // Resume attempt
      attempt.last_activity_at = nowStr;
      await attempt.save();

      await logEvent('STUDENT_RESUME', null, `Candidate ${name.trim()} (Roll ${normRoll}) resumed exam: ${matchedExam.title}`, req.ip);

      const remainingSeconds = Math.max(0, Math.round((deadlineTime - Date.now()) / 1000));
      return res.json({
        success: true,
        attemptId: attempt._id.toString(),
        examId: matchedExam._id.toString(),
        examTitle: matchedExam.title,
        durationMinutes: matchedExam.duration_minutes,
        remainingSeconds,
        candidateName: name.trim(),
        rollNumber: normRoll,
        grade: grade.trim(),
        division: normDiv,
        instructions: matchedExam.instructions,
        showResult: matchedExam.show_result_after_submit === true
      });
    }

    // Create new attempt
    const durationMs = matchedExam.duration_minutes * 60 * 1000;
    const deadlineStr = new Date(Date.now() + durationMs).toISOString();

    // Fetch and shuffle question IDs for this candidate
    const questions = await Question.find({ exam_id: matchedExam._id }).lean();
    const questionIds = questions.map(q => q._id);
    for (let i = questionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
    }

    const newAttempt = await Attempt.create({
      candidate_id: candidate._id,
      exam_id: matchedExam._id,
      start_time: nowStr,
      deadline: deadlineStr,
      status: 'In Exam',
      last_activity_at: nowStr,
      question_order: questionIds
    });

    // Initialize empty answers for all questions
    for (const q of questions) {
      await Answer.create({
        attempt_id: newAttempt._id,
        question_id: q._id,
        selected_option: null,
        is_marked_for_review: false,
        is_visited: false
      });
    }

    await logEvent('STUDENT_START', null, `Candidate ${name.trim()} (Roll ${normRoll}) started exam: ${matchedExam.title}`, req.ip);

    return res.json({
      success: true,
      attemptId: newAttempt._id.toString(),
      examId: matchedExam._id.toString(),
      examTitle: matchedExam.title,
      durationMinutes: matchedExam.duration_minutes,
      remainingSeconds: matchedExam.duration_minutes * 60,
      candidateName: name.trim(),
      rollNumber: normRoll,
      grade: grade.trim(),
      division: normDiv,
      instructions: matchedExam.instructions,
      showResult: matchedExam.show_result_after_submit === true
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error during login: ' + err.message });
  }
});

// 2. GET QUESTIONS (Never returns correct_answers! Supports per-student shuffling order)
router.get('/questions/:examId', async (req, res) => {
  try {
    const examId = req.params.examId;
    const attemptId = req.query.attemptId;
    
    const exam = await Exam.findById(examId);
    if (!exam || exam.status !== 'Open') {
      return res.status(403).json({ error: 'This examination is not open.' });
    }

    const questions = await Question.find({ exam_id: examId })
      .sort({ question_number: 1 })
      .lean();

    let sortedQuestions = questions;
    
    if (attemptId) {
      const attempt = await Attempt.findById(attemptId);
      if (attempt) {
        if (!attempt.question_order || attempt.question_order.length === 0) {
          const rawIds = questions.map(q => q._id);
          for (let i = rawIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rawIds[i], rawIds[j]] = [rawIds[j], rawIds[i]];
          }
          attempt.question_order = rawIds;
          await attempt.save();
        }
        
        const questionOrder = attempt.question_order.map(id => id.toString());
        const questionsMap = {};
        questions.forEach(q => {
          questionsMap[q._id.toString()] = q;
        });
        
        sortedQuestions = questionOrder
          .map(id => questionsMap[id])
          .filter(q => q !== undefined);
      }
    }

    res.json(sortedQuestions.map(q => ({
      id: q._id.toString(),
      question_number: q.question_number,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      marks: q.marks
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET ATTEMPT ANSWERS & REVIEW STATES
router.get('/attempt/:attemptId/answers', async (req, res) => {
  try {
    const attemptId = req.params.attemptId;
    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.status === 'In Exam' && Date.now() > Date.parse(attempt.deadline)) {
      await finalizeAttempt(attemptId, 'timeout');
      return res.json({ status: 'Auto Submitted', answers: [] });
    }

    const answers = await Answer.find({ attempt_id: attemptId }).lean();

    res.json({
      status: attempt.status,
      answers: answers.map(ans => ({
        question_id: ans.question_id.toString(),
        selected_option: ans.selected_option,
        is_marked_for_review: ans.is_marked_for_review ? 1 : 0,
        is_visited: ans.is_visited ? 1 : 0
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. AUTOSAVE ANSWER
router.post('/autosave', async (req, res) => {
  try {
    const { attemptId, questionId, selectedOption, isMarkedForReview, isVisited } = req.body;
    if (!attemptId || !questionId) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.status !== 'In Exam') {
      return res.status(403).json({ error: 'Exam attempt is already finalized. Autosave rejected.', locked: true });
    }

    if (Date.now() > Date.parse(attempt.deadline)) {
      await finalizeAttempt(attemptId, 'timeout');
      return res.status(403).json({ error: 'Exam time has expired. Attempt submitted.', locked: true });
    }

    if (selectedOption && !['A', 'B', 'C', 'D'].includes(selectedOption)) {
      return res.status(400).json({ error: 'Invalid selection option' });
    }

    const nowStr = new Date().toISOString();

    await Answer.findOneAndUpdate(
      { attempt_id: attemptId, question_id: questionId },
      {
        selected_option: selectedOption || null,
        is_marked_for_review: isMarkedForReview ? true : false,
        is_visited: isVisited ? true : false,
        updated_at: new Date()
      }
    );

    attempt.last_activity_at = nowStr;
    await attempt.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Autosave failed: ' + err.message });
  }
});

// 5. MANUAL SUBMIT
router.post('/submit', async (req, res) => {
  try {
    const { attemptId } = req.body;
    if (!attemptId) {
      return res.status(400).json({ error: 'Attempt ID is required' });
    }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const exam = await Exam.findById(attempt.exam_id).lean();
    const showResult = exam ? exam.show_result_after_submit === true : false;

    if (attempt.status !== 'In Exam') {
      const result = await getScoringSummary(attemptId, attempt.exam_id, attempt.score);
      return res.json({
        success: true,
        message: 'Exam submitted successfully.',
        showResult,
        result
      });
    }

    let submissionType = 'manual';
    if (Date.now() > Date.parse(attempt.deadline)) {
      submissionType = 'timeout';
    }

    const score = await finalizeAttempt(attemptId, submissionType);

    const result = await getScoringSummary(attemptId, attempt.exam_id, score);
    await logEvent('STUDENT_SUBMIT', null, `Attempt ID ${attemptId} submitted. Submission Type: ${submissionType}, Score: ${score}`, req.ip);

    res.json({
      success: true,
      message: 'Exam submitted successfully.',
      showResult,
      result
    });
  } catch (err) {
    res.status(500).json({ error: 'Submission failed: ' + err.message });
  }
});

async function finalizeAttempt(attemptId, submissionType) {
  // Lock attempt
  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.status !== 'In Exam') {
    return attempt ? attempt.score : 0;
  }

  const questions = await Question.find({ exam_id: attempt.exam_id });
  const answers = await Answer.find({ attempt_id: attemptId });

  const answersMap = {};
  answers.forEach(ans => {
    answersMap[ans.question_id.toString()] = ans.selected_option;
  });

  let finalScore = 0;
  questions.forEach(q => {
    const selected = answersMap[q._id.toString()];
    if (selected === q.correct_answer) {
      finalScore += q.marks;
    }
  });

  const nowStr = new Date().toISOString();
  attempt.status = submissionType === 'timeout' ? 'Auto Submitted' : 'Submitted';
  attempt.submission_type = submissionType;
  attempt.submitted_at = nowStr;
  attempt.score = finalScore;
  attempt.last_activity_at = nowStr;

  await attempt.save();

  return finalScore;
}

async function getScoringSummary(attemptId, examId, score) {
  const questions = await Question.find({ exam_id: examId }).lean();
  const answers = await Answer.find({ attempt_id: attemptId }).lean();
  
  const totalQuestions = questions.length;
  let attempted = 0;
  let unanswered = 0;

  const answeredQuestionIds = answers
    .filter(a => a.selected_option !== null)
    .map(a => a.question_id.toString());
  
  questions.forEach(q => {
    if (answeredQuestionIds.includes(q._id.toString())) {
      attempted++;
    } else {
      unanswered++;
    }
  });

  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const percentage = totalMarks > 0 ? parseFloat(((score / totalMarks) * 100).toFixed(2)) : 0;

  const exam = await Exam.findById(examId).lean();
  const passed = exam ? score >= exam.passing_marks : false;

  return {
    totalQuestions,
    attempted,
    unanswered,
    obtainedMarks: score,
    totalMarks,
    percentage,
    passed
  };
}

module.exports = router;
