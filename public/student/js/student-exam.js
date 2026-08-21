(function () {
  // Read session state
  var attemptId = sessionStorage.getItem('attemptId');
  var examId = sessionStorage.getItem('examId');
  var examTitle = sessionStorage.getItem('examTitle');
  var candidateName = sessionStorage.getItem('candidateName');
  var rollNumber = sessionStorage.getItem('rollNumber');
  var grade = sessionStorage.getItem('grade');
  var division = sessionStorage.getItem('division');
  var remainingSeconds = parseInt(sessionStorage.getItem('remainingSeconds'), 10) || 0;
  var instructions = sessionStorage.getItem('instructions');
  var showResult = sessionStorage.getItem('showResult') === 'true';

  if (!attemptId || !examId) {
    window.location.href = 'login.html';
    return;
  }

  // State variables
  var questions = [];
  var answersState = {}; // maps questionId -> { selected_option, is_marked_for_review, is_visited }
  var currentIndex = 0;
  var timerInterval = null;

  // DOM Elements
  var instructionsView = document.getElementById('instructionsView');
  var examView = document.getElementById('examView');
  var submissionView = document.getElementById('submissionView');
  
  var instExamTitle = document.getElementById('instExamTitle');
  var instructionsText = document.getElementById('instructionsText');
  var instName = document.getElementById('instName');
  var instRoll = document.getElementById('instRoll');
  var instGrade = document.getElementById('instGrade');
  var instDiv = document.getElementById('instDiv');
  var startExamBtn = document.getElementById('startExamBtn');

  var examHeaderTitle = document.getElementById('examHeaderTitle');
  var lblStudentName = document.getElementById('lblStudentName');
  var lblRollNumber = document.getElementById('lblRollNumber');
  var lblGradeDiv = document.getElementById('lblGradeDiv');
  var timerDisplay = document.getElementById('timerDisplay');

  var lblQuestionNumber = document.getElementById('lblQuestionNumber');
  var lblQuestionMarks = document.getElementById('lblQuestionMarks');
  var divQuestionText = document.getElementById('divQuestionText');
  
  var optA = document.getElementById('optA');
  var optB = document.getElementById('optB');
  var optC = document.getElementById('optC');
  var optD = document.getElementById('optD');
  
  var lblOptA = document.getElementById('lblOptA');
  var lblOptB = document.getElementById('lblOptB');
  var lblOptC = document.getElementById('lblOptC');
  var lblOptD = document.getElementById('lblOptD');

  var btnPrev = document.getElementById('btnPrev');
  var btnMark = document.getElementById('btnMark');
  var btnClear = document.getElementById('btnClear');
  var btnSaveNext = document.getElementById('btnSaveNext');
  var btnSubmit = document.getElementById('btnSubmit');
  var divPaletteGrid = document.getElementById('divPaletteGrid');

  // Confirmation Modal
  var confirmModal = document.getElementById('confirmModal');
  var btnCancelSubmit = document.getElementById('btnCancelSubmit');
  var btnConfirmSubmit = document.getElementById('btnConfirmSubmit');
  var cntTotal = document.getElementById('cntTotal');
  var cntAnswered = document.getElementById('cntAnswered');
  var cntReview = document.getElementById('cntReview');
  var cntUnanswered = document.getElementById('cntUnanswered');

  // Score Summary
  var pSubmitMsg = document.getElementById('pSubmitMsg');
  var divScoreSummary = document.getElementById('divScoreSummary');
  var resTotalQ = document.getElementById('resTotalQ');
  var resAttempted = document.getElementById('resAttempted');
  var resUnanswered = document.getElementById('resUnanswered');
  var resObtained = document.getElementById('resObtained');
  var resTotalMarks = document.getElementById('resTotalMarks');
  var resPercentage = document.getElementById('resPercentage');
  var resPassBadge = document.getElementById('resPassBadge');

  // Initialize Instructions View
  if (instExamTitle) instExamTitle.innerText = examTitle;
  if (instructionsText && instructions) instructionsText.innerText = instructions;
  if (instName) instName.innerText = candidateName;
  if (instRoll) instRoll.innerText = rollNumber;
  if (instGrade) instGrade.innerText = grade;
  if (instDiv) instDiv.innerText = division;

  startExamBtn.addEventListener('click', function () {
    instructionsView.style.display = 'none';
    examView.style.display = 'block';
    loadExamData();
  });

  // Load Exam Data
  function loadExamData() {
    // Fill header details
    examHeaderTitle.innerText = examTitle;
    lblStudentName.innerText = candidateName;
    lblRollNumber.innerText = rollNumber;
    lblGradeDiv.innerText = grade + ' / ' + division;

    // Fetch existing answers first
    var xhrAnswers = new XMLHttpRequest();
    xhrAnswers.open('GET', '/api/student/attempt/' + attemptId + '/answers', true);
    xhrAnswers.onreadystatechange = function () {
      if (xhrAnswers.readyState === 4) {
        if (xhrAnswers.status === 200) {
          var res = JSON.parse(xhrAnswers.responseText);
          if (res.status === 'Submitted' || res.status === 'Auto Submitted') {
            showSubmissionView(res.status);
            return;
          }
          // Build answers state map
          for (var i = 0; i < res.answers.length; i++) {
            var ans = res.answers[i];
            answersState[ans.question_id] = {
              selected_option: ans.selected_option,
              is_marked_for_review: ans.is_marked_for_review === 1,
              is_visited: ans.is_visited === 1
            };
          }

          // Now fetch questions
          fetchQuestions();
        } else {
          alert('Failed to connect to server to retrieve exam status. Please check connection and refresh.');
        }
      }
    };
    xhrAnswers.send();
  }

  function fetchQuestions() {
    var xhrQ = new XMLHttpRequest();
    xhrQ.open('GET', '/api/student/questions/' + examId, true);
    xhrQ.onreadystatechange = function () {
      if (xhrQ.readyState === 4) {
        if (xhrQ.status === 200) {
          questions = JSON.parse(xhrQ.responseText);
          if (questions.length === 0) {
            alert('No questions found in this exam. Please notify the teacher.');
            return;
          }

          // Initial Render
          renderQuestion(0);
          buildPalette();
          startTimer();
        } else {
          alert('Failed to load questions. Please check connection.');
        }
      }
    };
    xhrQ.send();
  }

  // Render Single Question
  function renderQuestion(index) {
    currentIndex = index;
    var q = questions[index];
    
    lblQuestionNumber.innerText = 'Question ' + q.question_number;
    lblQuestionMarks.innerText = q.marks + (q.marks === 1 ? ' Mark' : ' Marks');
    divQuestionText.innerText = q.question_text;

    lblOptA.innerText = q.option_a;
    lblOptB.innerText = q.option_b;
    lblOptC.innerText = q.option_c;
    lblOptD.innerText = q.option_d;

    // Reset radio selection
    optA.checked = false;
    optB.checked = false;
    optC.checked = false;
    optD.checked = false;
    
    // Clear select styling
    var options = document.getElementsByClassName('option-item');
    for (var i = 0; i < options.length; i++) {
      options[i].className = 'option-item';
    }

    // Set state
    if (!answersState[q.id]) {
      answersState[q.id] = { selected_option: null, is_marked_for_review: false, is_visited: true };
    } else {
      answersState[q.id].is_visited = true;
    }

    var savedAns = answersState[q.id].selected_option;
    if (savedAns === 'A') { optA.checked = true; optA.parentNode.className = 'option-item selected'; }
    if (savedAns === 'B') { optB.checked = true; optB.parentNode.className = 'option-item selected'; }
    if (savedAns === 'C') { optC.checked = true; optC.parentNode.className = 'option-item selected'; }
    if (savedAns === 'D') { optD.checked = true; optD.parentNode.className = 'option-item selected'; }

    // Toggle Review Button Text
    if (answersState[q.id].is_marked_for_review) {
      btnMark.innerText = 'Unmark Review';
    } else {
      btnMark.innerText = 'Mark for Review';
    }

    // Highlight current in palette
    updatePaletteClasses();
  }

  // Select Option Handler
  window.selectOption = function (letter) {
    var q = questions[currentIndex];
    
    // Update active checked
    optA.checked = (letter === 'A');
    optB.checked = (letter === 'B');
    optC.checked = (letter === 'C');
    optD.checked = (letter === 'D');

    var options = document.getElementsByClassName('option-item');
    for (var i = 0; i < options.length; i++) {
      var inp = options[i].getElementsByTagName('input')[0];
      if (inp.checked) {
        options[i].className = 'option-item selected';
      } else {
        options[i].className = 'option-item';
      }
    }

    answersState[q.id].selected_option = letter;
    triggerAutosave(q.id);
  };

  // Clear Handler
  btnClear.addEventListener('click', function () {
    var q = questions[currentIndex];
    optA.checked = false;
    optB.checked = false;
    optC.checked = false;
    optD.checked = false;

    var options = document.getElementsByClassName('option-item');
    for (var i = 0; i < options.length; i++) {
      options[i].className = 'option-item';
    }

    answersState[q.id].selected_option = null;
    triggerAutosave(q.id);
  });

  // Mark/Unmark Review
  btnMark.addEventListener('click', function () {
    var q = questions[currentIndex];
    answersState[q.id].is_marked_for_review = !answersState[q.id].is_marked_for_review;
    
    if (answersState[q.id].is_marked_for_review) {
      btnMark.innerText = 'Unmark Review';
    } else {
      btnMark.innerText = 'Mark for Review';
    }
    
    triggerAutosave(q.id);
  });

  // Trigger Autosave via API
  function triggerAutosave(questionId) {
    var state = answersState[questionId];
    var data = {
      attemptId: attemptId,
      questionId: questionId,
      selectedOption: state.selected_option,
      isMarkedForReview: state.is_marked_for_review,
      isVisited: state.is_visited
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/student/autosave', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          updatePaletteClasses();
        } else {
          // If locked or timeout, reject saving
          try {
            var response = JSON.parse(xhr.responseText);
            if (response.locked) {
              alert(response.error);
              showSubmissionView('Auto Submitted');
            }
          } catch (e) {
            console.error('Failed to parse autosave response');
          }
        }
      }
    };
    xhr.send(JSON.stringify(data));
  }

  // Navigation handlers
  btnPrev.addEventListener('click', function () {
    if (currentIndex > 0) {
      renderQuestion(currentIndex - 1);
    }
  });

  btnSaveNext.addEventListener('click', function () {
    // If option was not chosen, and question was visited, mark visited
    var q = questions[currentIndex];
    // Trigger final autosave for current question before shifting, just in case
    triggerAutosave(q.id);

    if (currentIndex < questions.length - 1) {
      renderQuestion(currentIndex + 1);
    }
  });

  // Build Question Navigation Palette
  function buildPalette() {
    divPaletteGrid.innerHTML = '';
    for (var i = 0; i < questions.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'palette-btn not-visited';
      btn.innerText = (i + 1);
      btn.id = 'palette-btn-' + i;
      
      // closures inside loops: use let equivalent or custom attribute
      btn.setAttribute('data-index', i);
      btn.addEventListener('click', function (e) {
        var idx = parseInt(e.target.getAttribute('data-index'), 10);
        
        // Save current question before switching
        var currentQ = questions[currentIndex];
        triggerAutosave(currentQ.id);

        renderQuestion(idx);
      });
      divPaletteGrid.appendChild(btn);
    }
    updatePaletteClasses();
  }

  // Update classes representing color codes
  function updatePaletteClasses() {
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var btn = document.getElementById('palette-btn-' + i);
      if (!btn) continue;

      var state = answersState[q.id];
      var cls = 'palette-btn';

      if (state) {
        if (state.selected_option && state.is_marked_for_review) {
          cls += ' answered-marked-review';
        } else if (state.is_marked_for_review) {
          cls += ' marked-review';
        } else if (state.selected_option) {
          cls += ' answered';
        } else if (state.is_visited) {
          cls += ' not-answered';
        } else {
          cls += ' not-visited';
        }
      } else {
        cls += ' not-visited';
      }

      if (i === currentIndex) {
        cls += ' current';
      }

      btn.className = cls;
    }
  }

  // Timer logic
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    function tick() {
      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        timerDisplay.innerText = '00:00';
        autoSubmitExam();
        return;
      }
      remainingSeconds--;
      sessionStorage.setItem('remainingSeconds', remainingSeconds);

      var mins = Math.floor(remainingSeconds / 60);
      var secs = remainingSeconds % 60;
      
      var minStr = (mins < 10 ? '0' : '') + mins;
      var secStr = (secs < 10 ? '0' : '') + secs;
      timerDisplay.innerText = minStr + ':' + secStr;

      // Periodically sync time from server or verify heartbeats 
      // Every 30 seconds, update candidate last activity / time check
      if (remainingSeconds % 30 === 0) {
        // Send small heartbeat packet if needed
      }
    }

    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // Auto-submit Exam on Timeout
  function autoSubmitExam() {
    alert('Time has expired! Your exam will be submitted automatically.');
    submitExamCall('timeout');
  }

  // Manual Submit button triggers Modal
  btnSubmit.addEventListener('click', function () {
    // Calculate details for modal
    var total = questions.length;
    var answered = 0;
    var review = 0;
    
    for (var i = 0; i < total; i++) {
      var q = questions[i];
      var state = answersState[q.id];
      if (state) {
        if (state.selected_option) answered++;
        if (state.is_marked_for_review) review++;
      }
    }

    cntTotal.innerText = total;
    cntAnswered.innerText = answered;
    cntReview.innerText = review;
    cntUnanswered.innerText = total - answered;

    confirmModal.style.display = 'block';
  });

  btnCancelSubmit.addEventListener('click', function () {
    confirmModal.style.display = 'none';
  });

  btnConfirmSubmit.addEventListener('click', function () {
    confirmModal.style.display = 'none';
    submitExamCall('manual');
  });

  // Call Submission API
  function submitExamCall(type) {
    if (timerInterval) clearInterval(timerInterval);
    
    var data = {
      attemptId: attemptId
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/student/submit', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          var res = JSON.parse(xhr.responseText);
          showSubmissionView(type === 'timeout' ? 'Auto Submitted' : 'Submitted', res.result);
        } else {
          alert('Submission failed. Please check connection and click submit again.');
          startTimer(); // resume timer in case
        }
      }
    };
    xhr.send(JSON.stringify(data));
  }

  // Show Submission View
  function showSubmissionView(status, result) {
    examView.style.display = 'none';
    submissionView.style.display = 'block';
    
    if (status === 'Auto Submitted') {
      pSubmitMsg.innerText = 'Your exam time expired and your responses were automatically submitted.';
      pSubmitMsg.style.color = '#dc3545';
    } else {
      pSubmitMsg.innerText = 'Your examination has been submitted successfully.';
    }

    // Unconditionally hide score summary from student upon submission
    divScoreSummary.style.display = 'none';

    // Clean session
    sessionStorage.clear();
  }
})();
