const mammoth = require('mammoth');
const { parseRawQuestions } = require('./questionNormalizer');

async function parseDocx(filePath, defaultMarks = 1) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value; // The raw text
    return parseRawQuestions(text, defaultMarks);
  } catch (err) {
    throw new Error('Failed to parse Word document: ' + err.message);
  }
}

module.exports = {
  parseDocx
};
