const request = require('supertest');
const app = require('../server/app');
const { initDb, Exam, Admin } = require('../server/db/database');

async function testDelete() {
  await initDb();
  
  // Login admin to get session cookie
  const resLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
    
  const cookie = resLogin.headers['set-cookie'];
  console.log('Login status:', resLogin.status);
  
  // Create a temporary exam to delete
  const tempExam = await Exam.create({
    academic_year_id: new mongoose.Types.ObjectId(),
    grade_id: new mongoose.Types.ObjectId(),
    subject_id: new mongoose.Types.ObjectId(),
    exam_type_id: new mongoose.Types.ObjectId(),
    title: 'Temp Exam to Delete',
    date: '2026-08-21',
    duration_minutes: 10,
    total_marks: 10,
    passing_marks: 5,
    pin_hash: 'mock',
    status: 'Draft'
  });
  
  const resDelete = await request(app)
    .delete(`/api/exams/${tempExam._id}`)
    .set('Cookie', cookie);
    
  console.log('Delete status:', resDelete.status);
  console.log('Delete returned:', resDelete.body);
  
  process.exit(0);
}

const mongoose = require('mongoose');

testDelete().catch(err => {
  console.error(err);
  process.exit(1);
});
