const request = require('supertest');
const app = require('../server/app');
const { initDb } = require('../server/db/database');

async function testCreate() {
  await initDb();
  
  // Login admin to get session cookie
  const resLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
    
  const cookie = resLogin.headers['set-cookie'];
  console.log('Login status:', resLogin.status);
  
  const payload = {
    academic_year: '2026-2027',
    grade: 'Grade 1',
    subject: 'Computer',
    exam_type: 'Unit Test 1',
    title: 'term 2',
    date: '2026-08-21',
    duration_minutes: '60',
    total_marks: '10',
    passing_marks: '5',
    pin: '123456',
    status: 'Open',
    show_result_after_submit: false,
    instructions: 'All The Best'
  };
  
  const resCreate = await request(app)
    .post('/api/exams')
    .set('Cookie', cookie)
    .send(payload);
    
  console.log('Create status:', resCreate.status);
  console.log('Create returned:', resCreate.body);
  
  process.exit(0);
}

testCreate().catch(err => {
  console.error(err);
  process.exit(1);
});
