const fs = require('fs');
const pdfParse = require('pdf-parse');
const { parseRawQuestions } = require('./questionNormalizer');

async function parsePdf(filePath, defaultMarks = 1) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    
    // pdf-parse options to check password-protection or issues
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    
    if (!text || text.trim().length === 0) {
      throw new Error('No readable text found in PDF (it may be scanned or empty).');
    }
    
    return parseRawQuestions(text, defaultMarks);
  } catch (err) {
    if (err.message && err.message.includes('password')) {
      throw new Error('PDF file is password-protected and cannot be parsed.');
    }
    throw new Error('Failed to parse PDF document: ' + err.message);
  }
}

module.exports = {
  parsePdf
};
