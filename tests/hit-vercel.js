const http = require('https');

function hitVercel() {
  const url = 'https://cbt-system-one.vercel.app/api/exams';
  console.log(`Hitting live Vercel URL: ${url}`);
  
  http.get(url, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('\nResponse Body (first 500 chars):');
      console.log(data.substring(0, 500));
    });
  }).on('error', (err) => {
    console.error('Error hitting Vercel:', err.message);
  });
}

hitVercel();
