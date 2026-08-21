const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { AcademicYear, Grade, Subject, ExamType, Exam, Question, Admin } = require('../server/db/database');
const config = require('../server/config/config');

async function seed() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected successfully.');

  // 1. Create Academic Year
  console.log('Seeding Academic Year...');
  const year = await AcademicYear.findOneAndUpdate(
    { name: '2026-27' },
    { name: '2026-27' },
    { upsert: true, new: true }
  );

  // 2. Create Subject
  console.log('Seeding Subject...');
  const subject = await Subject.findOneAndUpdate(
    { name: 'Computer' },
    { name: 'Computer' },
    { upsert: true, new: true }
  );

  // 3. Create Exam Type
  console.log('Seeding Exam Type...');
  const examType = await ExamType.findOneAndUpdate(
    { name: 'Term 1' },
    { name: 'Term 1' },
    { upsert: true, new: true }
  );

  // 4. Create default admin if none exists
  const adminCount = await Admin.countDocuments();
  if (adminCount === 0) {
    console.log('Seeding Default Admin Account...');
    const hashed = await bcrypt.hash('admin123', 10);
    await Admin.create({
      username: 'admin',
      password_hash: hashed
    });
    console.log('Default admin created: admin / admin123');
  }

  // 5. Seed Exams for Grade 1 through Grade 10
  const pinHash = await bcrypt.hash('123456', 10);

  const sampleQuestions = [
    {
      num: 1,
      text: 'What does CPU stand for?',
      a: 'Central Processing Unit',
      b: 'Computer Processing Unit',
      c: 'Central Program Utility',
      d: 'Control Processing Unit',
      ans: 'A',
      marks: 1
    },
    {
      num: 2,
      text: 'Which of the following is an input device?',
      a: 'Monitor',
      b: 'Printer',
      c: 'Keyboard',
      d: 'Speaker',
      ans: 'C',
      marks: 1
    },
    {
      num: 3,
      text: 'What is the brain of the computer?',
      a: 'RAM',
      b: 'CPU',
      c: 'Hard Disk',
      d: 'Motherboard',
      ans: 'B',
      marks: 1
    },
    {
      num: 4,
      text: 'Which key is used to start a new line in a text document?',
      a: 'Shift',
      b: 'Enter',
      c: 'Spacebar',
      d: 'Backspace',
      ans: 'B',
      marks: 1
    },
    {
      num: 5,
      text: 'Which of these is used to store files and data?',
      a: 'Mouse',
      b: 'Keyboard',
      c: 'USB Flash Drive',
      d: 'Monitor',
      ans: 'C',
      marks: 1
    }
  ];

  for (let g = 1; g <= 10; g++) {
    const gradeName = `Grade ${g}`;
    console.log(`Seeding demo exam for ${gradeName}...`);

    // Ensure Grade exists
    const gradeDoc = await Grade.findOneAndUpdate(
      { name: gradeName },
      { name: gradeName },
      { upsert: true, new: true }
    );

    // Create Exam
    const examTitle = `${gradeName} Demo Exam`;
    let examDoc = await Exam.findOne({ title: examTitle });
    
    if (!examDoc) {
      examDoc = await Exam.create({
        academic_year_id: year._id,
        grade_id: gradeDoc._id,
        subject_id: subject._id,
        exam_type_id: examType._id,
        title: examTitle,
        date: new Date().toISOString().split('T')[0],
        duration_minutes: 30,
        total_marks: 5,
        passing_marks: 2,
        pin_hash: pinHash,
        instructions: `Welcome to the ${gradeName} Demo Exam. PIN is 123456. Answer all 5 questions.`,
        status: 'Open',
        show_result_after_submit: true
      });

      // Seed Questions for this exam
      for (const q of sampleQuestions) {
        await Question.findOneAndUpdate(
          { exam_id: examDoc._id, question_number: q.num },
          {
            question_text: q.text,
            option_a: q.a,
            option_b: q.b,
            option_c: q.c,
            option_d: q.d,
            correct_answer: q.ans,
            marks: q.marks
          },
          { upsert: true, new: true }
        );
      }
      console.log(`Successfully created ${examTitle} and imported 5 questions.`);
    } else {
      console.log(`${examTitle} already exists. Skipping.`);
    }
  }

  console.log('\nSeeding completed successfully!');
  mongoose.connection.close();
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
