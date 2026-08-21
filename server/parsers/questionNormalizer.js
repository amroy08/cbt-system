const path = require('path');

/**
 * Normalizes and parses raw text into a list of question objects.
 * @param {string} text Raw text extracted from PDF/DOCX.
 * @param {number} defaultMarks Default marks to assign if not specified.
 */
function parseRawQuestions(text, defaultMarks = 1) {
  // Normalize line endings
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Check for separate answer key at the bottom
  const answerKeyRegex = /\b(?:ANSWER\s*KEY|ANSWERS|CORRECT\s*ANSWERS)\b/i;
  const matchKeySection = cleanText.match(answerKeyRegex);

  let questionsText = cleanText;
  let answerKeyText = '';
  if (matchKeySection) {
    const idx = matchKeySection.index;
    questionsText = cleanText.substring(0, idx);
    answerKeyText = cleanText.substring(idx);
  }

  // Parse questions from questionsText
  const lines = questionsText.split('\n');
  const questions = [];
  let currentQuestion = null;

  // Regexes
  // Match question start: e.g. "Q1. What...", "Question 1. What...", "1. What...", "1) What..."
  const qStartRegex = /^\s*(?:Q(?:uestion)?\s*[\.\-]?\s*(\d+)|(\d+))\s*[\.\)\-]?\s*(.+)$/i;
  
  // Match option: e.g. "A. Option", "a) Option", "(C) Option"
  const optionRegex = /^\s*\(?([A-Da-d])\)?[\.\)\s]\s*(.+)$/;

  // Match inline answer: "Answer: A" or "Ans - B" or "Correct Answer: C"
  const inlineAnswerRegex = /^\s*(?:Answer|Ans|Correct\s*Answer|Correct)\s*[:\-\s]\s*([A-D])\s*$/i;

  // Match marks: "(Marks: 2)" or "[3 Marks]" or "(1 mark)"
  const marksRegex = /[\(\[]\s*(?:Marks?\s*:\s*(\d+)|(\d+)\s*(?:marks?|pts|points))\s*[\)\]]/i;
  const standaloneMarksRegex = /^\s*(?:Marks?\s*[:\-]\s*(\d+)|(\d+)\s*marks?)\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check if new question
    const qMatch = line.match(qStartRegex);
    if (qMatch) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      const qNum = parseInt(qMatch[1] || qMatch[2], 10);
      let qText = qMatch[3].trim();

      // Check if marks is in the question line
      let qMarks = defaultMarks;
      const marksMatch = qText.match(marksRegex);
      if (marksMatch) {
        qMarks = parseInt(marksMatch[1] || marksMatch[2], 10) || defaultMarks;
        qText = qText.replace(marksRegex, '').trim();
      }

      currentQuestion = {
        question_number: qNum || (questions.length + 1),
        question_text: qText,
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_answer: '',
        marks: qMarks,
        optionsCount: 0
      };
      continue;
    }

    if (currentQuestion) {
      // Check inline answer
      const ansMatch = line.match(inlineAnswerRegex);
      if (ansMatch) {
        currentQuestion.correct_answer = ansMatch[1].toUpperCase();
        continue;
      }

      // Check option
      const optMatch = line.match(optionRegex);
      if (optMatch) {
        const optLetter = optMatch[1].toUpperCase();
        const optText = optMatch[2].trim();
        if (optLetter === 'A') currentQuestion.option_a = optText;
        if (optLetter === 'B') currentQuestion.option_b = optText;
        if (optLetter === 'C') currentQuestion.option_c = optText;
        if (optLetter === 'D') currentQuestion.option_d = optText;
        currentQuestion.optionsCount++;
        continue;
      }

      // Check inline marks in subsequent line
      const marksMatch = line.match(marksRegex) || line.match(standaloneMarksRegex);
      if (marksMatch) {
        currentQuestion.marks = parseInt(marksMatch[1] || marksMatch[2], 10) || currentQuestion.marks;
        continue;
      }

      // If it doesn't match question, option, or answer, append to question text if options not started
      if (currentQuestion.optionsCount === 0 && !currentQuestion.correct_answer) {
        currentQuestion.question_text += '\n' + line;
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  // Parse separate answer key if present
  const separateAnswers = {};
  if (answerKeyText) {
    const keyLines = answerKeyText.split('\n');
    const answerKeyPattern = /(\d+)\s*[\.\-\)\s]\s*([A-D])\b/gi;
    for (const keyLine of keyLines) {
      let match;
      while ((match = answerKeyPattern.exec(keyLine)) !== null) {
        const num = parseInt(match[1], 10);
        const ans = match[2].toUpperCase();
        separateAnswers[num] = ans;
      }
    }
  }

  // Post-process, map separate answers, and validate
  return questions.map((q) => {
    // If separate answer key found, apply it
    if (!q.correct_answer && separateAnswers[q.question_number]) {
      q.correct_answer = separateAnswers[q.question_number];
    }

    // Determine validation status
    // V1 requirement: question text, four non-empty options, correct answer A-D, marks > 0
    const hasText = !!q.question_text.trim();
    const hasFourOptions = !!(q.option_a && q.option_b && q.option_c && q.option_d);
    const hasValidAnswer = ['A', 'B', 'C', 'D'].includes(q.correct_answer);
    const hasValidMarks = q.marks > 0;

    let validation_status = 'Ready';
    const validation_errors = [];

    if (!hasText) validation_errors.push('Question text is required.');
    if (!hasFourOptions) validation_errors.push('Exactly four options (A, B, C, D) are required.');
    if (!hasValidAnswer) validation_errors.push('Correct answer must be one of A, B, C, or D.');
    if (!hasValidMarks) validation_errors.push('Marks must be greater than 0.');

    if (validation_errors.length > 0) {
      validation_status = 'Requires Review';
    }

    return {
      question_number: q.question_number,
      question_text: q.question_text.trim(),
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      marks: q.marks,
      validation_status,
      validation_errors
    };
  });
}

module.exports = {
  parseRawQuestions
};
