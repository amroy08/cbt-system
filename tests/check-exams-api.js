const request = require('supertest');
const app = require('../server/app');
const { initDb, Admin } = require('../server/db/database');

async function testExams() {
  await initDb();
  
  // Login admin to get session cookie
  const resLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
    
  const cookie = resLogin.headers['set-cookie'];
  console.log('Login status:', resLogin.status);
  
  const resExams = await request(app)
    .get('/api/exams')
    .set('Cookie', cookie);
    
  console.log('Exams status:', resExams.status);
  console.log('Exams returned:', resExams.body);
  
  process.exit(0);
}

testExams().catch(err => {
  console.error(err);
  process.exit(1);
});
