const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
  console.log('Installing pdfkit temporarily to generate a clean sample PDF...');
  try {
    execSync('npm install --no-save pdfkit', { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to install pdfkit:', err);
    process.exit(1);
  }

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument();
  const destPath = path.resolve('tests/grade-1-computer-quiz.pdf');

  console.log(`Writing sample PDF to ${destPath}...`);
  const stream = fs.createWriteStream(destPath);
  doc.pipe(stream);

  // Title
  doc.fontSize(22).text('Grade 1 Computer Quiz', { align: 'center' });
  doc.moveDown(2);

  // Questions
  const questions = [
    {
      q: 'Q1. What is the physical part of a computer called?',
      options: ['A) Software', 'B) Hardware', 'C) Logic', 'D) Mind'],
      ans: 'Answer: B',
      marks: 'Marks: 2'
    },
    {
      q: 'Q2. Which of these is a machine?',
      options: ['A) Tree', 'B) Laptop', 'C) Pencil', 'D) Cat'],
      ans: 'Correct Answer: B',
      marks: 'Marks: 2'
    },
    {
      q: 'Q3. What do you use to type letters on a computer?',
      options: ['A) Keyboard', 'B) Mouse', 'C) Printer', 'D) Speaker'],
      ans: 'Answer: A',
      marks: 'Marks: 1'
    }
  ];

  questions.forEach(item => {
    doc.fontSize(14).text(item.q);
    doc.moveDown(0.3);
    item.options.forEach(opt => {
      doc.fontSize(12).text(opt, { indent: 20 });
    });
    doc.moveDown(0.3);
    doc.fontSize(12).text(item.ans);
    doc.fontSize(12).text(item.marks);
    doc.moveDown(1.5);
  });

  doc.end();

  stream.on('finish', () => {
    console.log('Sample PDF created successfully.');
    console.log(`File is located at: file://${destPath}`);
  });
}

main().catch(err => {
  console.error(err);
});
