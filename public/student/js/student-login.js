(function () {
  var loginForm = document.getElementById('loginForm');
  var errorBox = document.getElementById('errorBox');

  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.style.display = 'none';

      var name = document.getElementById('studentName').value;
      var rollNumber = document.getElementById('rollNumber').value;
      var grade = document.getElementById('studentGrade').value;
      var division = document.getElementById('studentDivision').value;
      var pin = document.getElementById('examPin').value;

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/student/login', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var response;
          try {
            response = JSON.parse(xhr.responseText);
          } catch (err) {
            response = { error: 'An unexpected connection error occurred.' };
          }

          if (xhr.status === 200 && response.success) {
            // Save attempt context in sessionStorage
            sessionStorage.setItem('attemptId', response.attemptId);
            sessionStorage.setItem('examId', response.examId);
            sessionStorage.setItem('examTitle', response.examTitle);
            sessionStorage.setItem('candidateName', response.candidateName);
            sessionStorage.setItem('rollNumber', response.rollNumber);
            sessionStorage.setItem('grade', response.grade);
            sessionStorage.setItem('division', response.division);
            sessionStorage.setItem('remainingSeconds', response.remainingSeconds);
            sessionStorage.setItem('instructions', response.instructions || '');
            sessionStorage.setItem('showResult', response.showResult ? 'true' : 'false');
            
            // Redirect to exam page
            window.location.href = 'exam.html';
          } else {
            errorBox.innerText = response.error || 'Login verification failed.';
            errorBox.style.display = 'block';
          }
        }
      };

      xhr.send(JSON.stringify({
        name: name,
        rollNumber: rollNumber,
        grade: grade,
        division: division,
        pin: pin
      }));
    });
  }
})();
