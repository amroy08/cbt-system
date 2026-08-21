const path = require('path');
const fs = require('fs');
const { parseDocx } = require('../parsers/docxQuestionParser');
const { parsePdf } = require('../parsers/pdfQuestionParser');
const { Question, ImportBatch } = require('../db/database');

function normalizeForComparison(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function parseQuestionPaper(filePath, ext, defaultMarks = 1, examId) {
  let parsed = [];
  if (ext === '.docx') {
    parsed = await parseDocx(filePath, defaultMarks);
  } else if (ext === '.pdf') {
    parsed = await parsePdf(filePath, defaultMarks);
  } else {
    throw new Error('Unsupported file extension. Only .docx and .pdf are supported.');
  }

  if (parsed.length === 0) {
    throw new Error('No questions detected in the question paper.');
  }

  // Fetch existing questions
  const existing = await Question.find({ exam_id: examId }).lean();
  
  const existingTexts = existing.map(q => normalizeForComparison(q.question_text));
  const existingNumbers = existing.map(q => q.question_number);

  return parsed.map((q) => {
    const textNorm = normalizeForComparison(q.question_text);
    let is_duplicate = false;
    let duplicate_reason = '';

    if (existingTexts.includes(textNorm)) {
      is_duplicate = true;
      duplicate_reason = 'Question with similar text already exists in this exam.';
    } else if (existingNumbers.includes(q.question_number)) {
      is_duplicate = true;
      duplicate_reason = `Question number ${q.question_number} already exists in this exam.`;
    }

    return {
      ...q,
      is_duplicate,
      duplicate_reason
    };
  });
}

async function importQuestionsTransaction(examId, questionsToImport, filename, metadata) {
  const { academic_year_id, grade_id, subject_id, exam_type_id } = metadata;
  
  let importedCount = 0;
  let skippedCount = 0;

  for (const q of questionsToImport) {
    if (q.action === 'Skip') {
      skippedCount++;
      continue;
    }

    if (q.action === 'Replace') {
      await Question.deleteMany({
        exam_id: examId,
        $or: [
          { question_number: q.question_number },
          { question_text: q.question_text }
        ]
      });
    }

    await Question.findOneAndUpdate(
      { exam_id: examId, question_number: q.question_number },
      {
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        marks: q.marks
      },
      { upsert: true, new: true }
    );
    
    importedCount++;
  }

  await ImportBatch.create({
    filename,
    academic_year_id,
    grade_id,
    subject_id,
    exam_type_id,
    exam_id: examId,
    detected_count: questionsToImport.length,
    imported_count: importedCount,
    skipped_count: skippedCount,
    status: 'Completed'
  });

  return {
    importedCount,
    skippedCount
  };
}

module.exports = {
  parseQuestionPaper,
  importQuestionsTransaction
};
