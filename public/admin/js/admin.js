// Admin Dashboard Engine
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadAllMetadata();
  initExamCrud();
  initSettingsCrud();
  initImportPipeline();
  initMonitoring();
  initResultsDashboard();
  initBackupsAndLogs();

  // Populate exams table on startup
  loadExamsTable();

  // Logout button
  document.getElementById('btnLogout').addEventListener('click', () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        window.location.href = 'login.html';
      });
  });
});

// Cache variables for metadata dropdowns
let yearsList = [];
let gradesList = [];
let subjectsList = [];
let examTypesList = [];
let examsList = [];

// Sidebar Navigation
function initNavigation() {
  const navLinks = document.querySelectorAll('.admin-sidebar ul li a');
  const sections = document.querySelectorAll('.admin-content section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetSection = link.getAttribute('data-section');
      
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      sections.forEach(sec => {
        if (sec.id === targetSection) {
          sec.classList.add('active');
          onSectionVisible(targetSection);
        } else {
          sec.classList.remove('active');
        }
      });
    });
  });
}

function onSectionVisible(sectionId) {
  if (sectionId === 'secExams') loadExamsTable();
  if (sectionId === 'secImport') loadImportExamDropdown();
  if (sectionId === 'secMonitor') loadMonitorExamDropdown();
  if (sectionId === 'secResults') loadResultsExamDropdown();
  if (sectionId === 'secSettings') loadAcademicSettings();
  if (sectionId === 'secBackups') loadBackupsTable();
  if (sectionId === 'secAudit') loadAuditLogsTable();
}

// Load metadata lists
async function loadAllMetadata() {
  try {
    const [yRes, gRes, sRes, tRes] = await Promise.all([
      fetch('/api/admin/years').then(r => r.json()),
      fetch('/api/admin/grades').then(r => r.json()),
      fetch('/api/admin/subjects').then(r => r.json()),
      fetch('/api/admin/exam-types').then(r => r.json())
    ]);

    yearsList = Array.isArray(yRes) ? yRes : [];
    gradesList = Array.isArray(gRes) ? gRes : [];
    subjectsList = Array.isArray(sRes) ? sRes : [];
    examTypesList = Array.isArray(tRes) ? tRes : [];

    // Populate dropdowns in Modal
    populateSelect('examYear', yearsList);
    populateSelect('examGrade', gradesList);
    populateSelect('examSubject', subjectsList);
    populateSelect('examType', examTypesList);

    loadExamsTable(); // initial load
  } catch (err) {
    console.error('Failed to load initial metadata', err);
  }
}

function populateSelect(elemId, list, defaultText = '-- Select --') {
  const select = document.getElementById(elemId);
  if (!select) return;
  select.innerHTML = `<option value="">${defaultText}</option>`;
  list.forEach(item => {
    select.innerHTML += `<option value="${item.id}">${item.name}</option>`;
  });
}

// ==========================================
// EXAMS MANAGEMENT CRUD
// ==========================================
const modalExam = document.getElementById('modalExam');
const formExam = document.getElementById('formExam');
const tblExamsBody = document.querySelector('#tblExams tbody');

function initExamCrud() {
  document.getElementById('btnCreateExam').addEventListener('click', () => {
    document.getElementById('examModalTitle').innerText = 'Create Exam';
    formExam.reset();
    document.getElementById('editExamId').value = '';
    document.getElementById('examPin').required = true;
    document.getElementById('pinHelp').innerText = 'Required for creation.';
    modalExam.style.display = 'block';
  });

  formExam.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editExamId').value;
    
    const payload = {
      academic_year: document.getElementById('examYear').value,
      grade: document.getElementById('examGrade').value,
      subject: document.getElementById('examSubject').value,
      exam_type: document.getElementById('examType').value,
      title: document.getElementById('examTitle').value,
      date: document.getElementById('examDate').value,
      duration_minutes: document.getElementById('examDuration').value,
      total_marks: document.getElementById('examTotalMarks').value,
      passing_marks: document.getElementById('examPassingMarks').value,
      pin: document.getElementById('examPin').value,
      status: document.getElementById('examStatus').value,
      show_result_after_submit: document.getElementById('examShowResult').value === '1',
      instructions: document.getElementById('examInstructions').value
    };

    try {
      let res;
      if (id) {
        // Update
        res = await fetch(`/api/exams/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // Create
        res = await fetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        closeExamModal();
        loadExamsTable();
      } else {
        alert(data.error || 'Failed to save exam.');
      }
    } catch (err) {
      alert('Error saving exam.');
    }
  });
}

window.closeExamModal = function() {
  modalExam.style.display = 'none';
};

async function loadExamsTable() {
  try {
    const res = await fetch('/api/exams');
    examsList = await res.json();

    tblExamsBody.innerHTML = '';
    examsList.forEach(ex => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${ex.title}</strong></td>
        <td>${ex.academic_year}</td>
        <td>${ex.grade}</td>
        <td>${ex.subject}</td>
        <td>${ex.exam_type}</td>
        <td>${ex.date}</td>
        <td>${ex.duration_minutes} mins</td>
        <td>${ex.total_marks}</td>
        <td>${ex.question_count} Qs</td>
        <td><span class="badge ${ex.status === 'Open' ? 'badge-success' : ex.status === 'Closed' ? 'badge-danger' : 'badge-warning'}">${ex.status}</span></td>
        <td>
          <button class="btn btn-warning" style="padding: 3px 8px; font-size: 12px;" onclick="editExam('${ex.id}')">Edit</button>
          <button class="btn btn-danger" style="padding: 3px 8px; font-size: 12px;" onclick="deleteExam('${ex.id}')">Del</button>
        </td>
      `;
      tblExamsBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load exams table', err);
  }
}

window.editExam = async function(id) {
  try {
    const res = await fetch(`/api/exams/${id}`);
    const ex = await res.json();

    document.getElementById('examModalTitle').innerText = 'Edit Exam';
    document.getElementById('editExamId').value = ex.id;
    
    document.getElementById('examYear').value = ex.academic_year;
    document.getElementById('examGrade').value = ex.grade;
    document.getElementById('examSubject').value = ex.subject;
    document.getElementById('examType').value = ex.exam_type;
    document.getElementById('examTitle').value = ex.title;
    document.getElementById('examDate').value = ex.date;
    document.getElementById('examDuration').value = ex.duration_minutes;
    document.getElementById('examTotalMarks').value = ex.total_marks;
    document.getElementById('examPassingMarks').value = ex.passing_marks;
    
    document.getElementById('examPin').value = ''; // empty, optional
    document.getElementById('examPin').required = false;
    document.getElementById('pinHelp').innerText = 'Leave blank to retain current PIN.';
    
    document.getElementById('examStatus').value = ex.status;
    document.getElementById('examShowResult').value = ex.show_result_after_submit ? '1' : '0';
    document.getElementById('examInstructions').value = ex.instructions || '';

    modalExam.style.display = 'block';
  } catch (err) {
    alert('Failed to load exam details.');
  }
};

window.deleteExam = async function(id) {
  if (!confirm('Are you sure you want to delete this exam? All associated questions will be deleted.')) return;
  try {
    const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadExamsTable();
    } else {
      alert(data.error || 'Failed to delete exam.');
    }
  } catch (err) {
    alert('Error deleting exam.');
  }
};

// ==========================================
// QUESTION IMPORT PIPELINE
// ==========================================
let currentParsedQuestions = [];
let currentUploadFilename = '';

function initImportPipeline() {
  const form = document.getElementById('formImportPaper');
  const alertBox = document.getElementById('importAlertBox');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.style.display = 'none';

    const examId = document.getElementById('importExamSelect').value;
    const defaultMarks = document.getElementById('importDefaultMarks').value;
    const fileInput = document.getElementById('qpaperFile');

    if (!examId || !fileInput.files[0]) {
      alert('Please select an exam and file.');
      return;
    }

    const formData = new FormData();
    formData.append('qpaper', fileInput.files[0]);
    formData.append('examId', examId);
    formData.append('defaultMarks', defaultMarks);

    try {
      alertBox.className = 'alert alert-success';
      alertBox.innerText = 'Parsing file, please wait...';
      alertBox.style.display = 'block';

      const res = await fetch('/api/exams/import/parse', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        alertBox.style.display = 'none';
        currentParsedQuestions = data.questions;
        currentUploadFilename = data.filename;
        renderImportPreview();
      } else {
        alertBox.className = 'alert alert-danger';
        alertBox.innerText = data.error || 'Failed to parse file.';
      }
    } catch (err) {
      alertBox.className = 'alert alert-danger';
      alertBox.innerText = 'Connection error during parsing.';
    }
  });

  // Confirm Import
  document.getElementById('btnConfirmImport').addEventListener('click', async () => {
    const examId = document.getElementById('importExamSelect').value;
    if (!examId) return;

    // Build edited list from forms
    const questionsToImport = currentParsedQuestions.map((q, idx) => {
      const prefix = `q-draft-${idx}`;
      return {
        question_number: parseInt(document.getElementById(`${prefix}-num`).value, 10),
        question_text: document.getElementById(`${prefix}-text`).value,
        option_a: document.getElementById(`${prefix}-optA`).value,
        option_b: document.getElementById(`${prefix}-optB`).value,
        option_c: document.getElementById(`${prefix}-optC`).value,
        option_d: document.getElementById(`${prefix}-optD`).value,
        correct_answer: document.getElementById(`${prefix}-ans`).value,
        marks: parseInt(document.getElementById(`${prefix}-marks`).value, 10),
        action: document.getElementById(`${prefix}-action`).value
      };
    });

    try {
      const res = await fetch('/api/exams/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId,
          questions: questionsToImport,
          filename: currentUploadFilename
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully imported ${data.importedCount} questions, skipped ${data.skippedCount}!`);
        document.getElementById('divImportPreviewArea').style.display = 'none';
        form.reset();
        loadExamsTable();
      } else {
        alert(data.error || 'Failed to import questions.');
      }
    } catch (err) {
      alert('Import failed.');
    }
  });

  document.getElementById('btnCancelImport').addEventListener('click', () => {
    document.getElementById('divImportPreviewArea').style.display = 'none';
  });
}

function loadImportExamDropdown() {
  populateSelect('importExamSelect', examsList.map(e => ({ id: e.id, name: `${e.title} (${e.grade} - ${e.subject})` })), '-- Select Exam --');
}

function renderImportPreview() {
  const container = document.getElementById('divPreviewContainer');
  container.innerHTML = '';

  let detected = currentParsedQuestions.length;
  let ready = 0;
  let review = 0;
  let duplicates = 0;

  currentParsedQuestions.forEach((q, idx) => {
    const isDuplicate = q.is_duplicate;
    const isInvalid = q.validation_status === 'Requires Review';

    if (isInvalid) review++;
    else ready++;
    if (isDuplicate) duplicates++;

    const prefix = `q-draft-${idx}`;

    const card = document.createElement('div');
    card.className = `q-preview-card ${isInvalid ? 'invalid' : ''} ${isDuplicate ? 'duplicate' : ''}`;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <strong>Question Draft #${idx + 1}</strong>
        <div>
          ${isInvalid ? `<span class="badge badge-danger">Validation Error</span>` : `<span class="badge badge-success">Valid MCQ</span>`}
          ${isDuplicate ? `<span class="badge badge-warning" title="${q.duplicate_reason}">Duplicate Flag</span>` : ''}
        </div>
      </div>
      
      <div class="grid-2">
        <div class="form-group">
          <label>Question Number</label>
          <input type="number" id="${prefix}-num" class="form-control" value="${q.question_number}" min="1">
        </div>
        <div class="form-group">
          <label>Marks</label>
          <input type="number" id="${prefix}-marks" class="form-control" value="${q.marks}" min="1">
        </div>
      </div>

      <div class="form-group">
        <label>Question Text</label>
        <textarea id="${prefix}-text" class="form-control" rows="2">${q.question_text}</textarea>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>Option A</label>
          <input type="text" id="${prefix}-optA" class="form-control" value="${q.option_a}">
        </div>
        <div class="form-group">
          <label>Option B</label>
          <input type="text" id="${prefix}-optB" class="form-control" value="${q.option_b}">
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>Option C</label>
          <input type="text" id="${prefix}-optC" class="form-control" value="${q.option_c}">
        </div>
        <div class="form-group">
          <label>Option D</label>
          <input type="text" id="${prefix}-optD" class="form-control" value="${q.option_d}">
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>Correct Option (A, B, C, D)</label>
          <select id="${prefix}-ans" class="form-control">
            <option value="">-- Choose --</option>
            <option value="A" ${q.correct_answer === 'A' ? 'selected' : ''}>A</option>
            <option value="B" ${q.correct_answer === 'B' ? 'selected' : ''}>B</option>
            <option value="C" ${q.correct_answer === 'C' ? 'selected' : ''}>C</option>
            <option value="D" ${q.correct_answer === 'D' ? 'selected' : ''}>D</option>
          </select>
        </div>
        <div class="form-group">
          <label>Import Strategy</label>
          <select id="${prefix}-action" class="form-control">
            <option value="Import" ${!isDuplicate ? 'selected' : ''}>Import New</option>
            <option value="Replace" ${isDuplicate && q.duplicate_reason.includes('number') ? 'selected' : ''}>Replace Existing</option>
            <option value="Skip" ${isDuplicate && !q.duplicate_reason.includes('number') ? 'selected' : ''}>Skip / Do Not Import</option>
          </select>
        </div>
      </div>

      ${isInvalid ? `<div style="color:#dc3545; font-size:12px; margin-top:5px;"><strong>Errors:</strong> ${q.validation_errors.join(', ')}</div>` : ''}
      ${isDuplicate ? `<div style="color:#856404; font-size:12px; margin-top:5px;"><strong>Duplicate Alert:</strong> ${q.duplicate_reason}</div>` : ''}
    `;
    container.appendChild(card);
  });

  document.getElementById('cntDetected').innerText = detected;
  document.getElementById('cntReady').innerText = ready;
  document.getElementById('cntReviewRequired').innerText = review;
  document.getElementById('cntDuplicates').innerText = duplicates;

  document.getElementById('divImportPreviewArea').style.display = 'block';
}

// ==========================================
// LIVE CANDIDATE MONITORING
// ==========================================
let monitorInterval = null;

function initMonitoring() {
  document.getElementById('btnRefreshMonitor').addEventListener('click', () => {
    triggerMonitorFetch();
  });

  document.getElementById('monitorExamSelect').addEventListener('change', () => {
    triggerMonitorFetch();
    
    // Auto-poll every 5 seconds when selected
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(triggerMonitorFetch, 5000);
  });
}

function loadMonitorExamDropdown() {
  populateSelect('monitorExamSelect', examsList.filter(e => e.status === 'Open'), '-- Select Open Exam --');
  // clear tbl on tab switch
  document.getElementById('tblMonitor').style.display = 'none';
  document.getElementById('monitorStats').style.display = 'none';
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

async function triggerMonitorFetch() {
  const examId = document.getElementById('monitorExamSelect').value;
  if (!examId) {
    document.getElementById('tblMonitor').style.display = 'none';
    document.getElementById('monitorStats').style.display = 'none';
    if (monitorInterval) clearInterval(monitorInterval);
    return;
  }

  try {
    const res = await fetch(`/api/admin/monitor/${examId}`);
    const data = await res.json();
    
    // Fill stats
    document.getElementById('monStatTotal').innerText = data.counts.total;
    document.getElementById('monStatActive').innerText = data.counts.active;
    document.getElementById('monStatInactive').innerText = data.counts.inactive;
    document.getElementById('monStatSubmitted').innerText = data.counts.submitted + data.counts.autoSubmitted;
    document.getElementById('monitorStats').style.display = 'grid';

    // Fill table
    const tbody = document.querySelector('#tblMonitor tbody');
    tbody.innerHTML = '';
    
    if (data.candidates.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No students have logged into this exam yet.</td></tr>';
    } else {
      data.candidates.forEach(c => {
        let mins = Math.floor(c.remaining_seconds / 60);
        let secs = c.remaining_seconds % 60;
        let timeFormatted = c.status === 'Active' ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : '-';

        const lastActDate = new Date(c.last_activity_at).toLocaleTimeString();

        // live status styling
        let statusBadge = '';
        if (c.status === 'Active') statusBadge = `<span class="badge badge-success">Active</span>`;
        else if (c.status === 'Inactive/Disconnected') statusBadge = `<span class="badge badge-warning">Disconnected</span>`;
        else if (c.status === 'Submitted') statusBadge = `<span class="badge badge-danger">Submitted</span>`;
        else if (c.status === 'Auto Submitted') statusBadge = `<span class="badge badge-danger">Auto Submitted</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${c.roll_number}</td>
          <td><strong>${c.name}</strong></td>
          <td>${c.grade}</td>
          <td>${c.division}</td>
          <td>${new Date(c.start_time).toLocaleTimeString()}</td>
          <td>${timeFormatted}</td>
          <td>${lastActDate}</td>
          <td>${statusBadge}</td>
          <td>
            ${(c.status === 'Active' || c.status === 'Inactive/Disconnected') ? 
              `<button class="btn btn-danger" style="padding:3px 8px; font-size:12px;" onclick="forceSubmit('${examId}', '${c.roll_number}')">Force Submit</button>` : 
              '-'}
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById('tblMonitor').style.display = 'table';
  } catch (err) {
    console.error('Failed to poll monitor', err);
  }
}

window.forceSubmit = async function(examId, rollNumber) {
  if (!confirm(`Are you sure you want to FORCE SUBMIT Roll Number ${rollNumber}? This will lock their attempt and calculate results.`)) return;
  try {
    const res = await fetch(`/api/admin/monitor/force-submit/${examId}/${rollNumber}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      triggerMonitorFetch();
    } else {
      alert(data.error || 'Failed to force submit candidate.');
    }
  } catch (err) {
    alert('Connection error.');
  }
};

// ==========================================
// RESULTS DASHBOARD
// ==========================================
function initResultsDashboard() {
  document.getElementById('btnFilterResults').addEventListener('click', () => {
    loadResultsTable();
  });

  document.getElementById('btnExportCSV').addEventListener('click', () => {
    const examId = document.getElementById('resultsExamSelect').value;
    const division = document.getElementById('resultsDivisionSelect').value;
    if (!examId) return;
    
    // Redirect browser to download CSV endpoint
    window.location.href = `/api/admin/export-csv?examId=${examId}&division=${encodeURIComponent(division)}`;
  });
}

function loadResultsExamDropdown() {
  populateSelect('resultsExamSelect', examsList, '-- Select Exam --');
  document.getElementById('tblResults').style.display = 'none';
  document.getElementById('btnExportCSV').style.display = 'none';
}

async function loadResultsTable() {
  const examId = document.getElementById('resultsExamSelect').value;
  const division = document.getElementById('resultsDivisionSelect').value;
  
  if (!examId) {
    alert('Please select an exam.');
    return;
  }

  try {
    const query = `examId=${examId}&division=${encodeURIComponent(division)}`;
    const res = await fetch(`/api/admin/results?${query}`);
    const results = await res.json();

    const tbody = document.querySelector('#tblResults tbody');
    tbody.innerHTML = '';

    if (results.length === 0) {
      tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;">No attempts found for this exam filters.</td></tr>';
      document.getElementById('btnExportCSV').style.display = 'none';
    } else {
      results.forEach(r => {
        const start = new Date(r.start_time).toLocaleTimeString();
        const submit = r.submitted_at !== '-' ? new Date(r.submitted_at).toLocaleTimeString() : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.roll_number}</td>
          <td><strong>${r.name}</strong></td>
          <td>${r.grade}</td>
          <td>${r.division}</td>
          <td>${r.attempted}</td>
          <td style="color:green; font-weight:bold;">${r.correct}</td>
          <td style="color:red;">${r.incorrect}</td>
          <td style="color:gray;">${r.unanswered}</td>
          <td><strong>${r.score}</strong></td>
          <td>${r.total_marks}</td>
          <td><strong>${r.percentage}%</strong></td>
          <td><span class="badge ${r.status.startsWith('Auto') ? 'badge-warning' : 'badge-success'}">${r.status}</span></td>
          <td>${r.submission_type}</td>
          <td>${start}</td>
          <td>${submit}</td>
        `;
        tbody.appendChild(tr);
      });
      document.getElementById('btnExportCSV').style.display = 'inline-block';
    }

    document.getElementById('tblResults').style.display = 'table';
  } catch (err) {
    alert('Failed to fetch results.');
  }
}

// ==========================================
// ACADEMIC SETTINGS (Years, Grades, Subjects)
// ==========================================
function initSettingsCrud() {
  // Years Form
  document.getElementById('formAddYear').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newYearName').value;
    try {
      const res = await fetch('/api/admin/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.id) {
        document.getElementById('newYearName').value = '';
        loadAcademicSettings();
        loadAllMetadata();
      } else {
        alert(data.error);
      }
    } catch (e) { alert('Add failed'); }
  });

  // Grades Form
  document.getElementById('formAddGrade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newGradeName').value;
    try {
      const res = await fetch('/api/admin/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.id) {
        document.getElementById('newGradeName').value = '';
        loadAcademicSettings();
        loadAllMetadata();
      } else {
        alert(data.error);
      }
    } catch (e) { alert('Add failed'); }
  });

  // Subjects Form
  document.getElementById('formAddSubject').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newSubjectName').value;
    try {
      const res = await fetch('/api/admin/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.id) {
        document.getElementById('newSubjectName').value = '';
        loadAcademicSettings();
        loadAllMetadata();
      } else {
        alert(data.error);
      }
    } catch (e) { alert('Add failed'); }
  });
}

async function loadAcademicSettings() {
  try {
    const [years, grades, subjects, types] = await Promise.all([
      fetch('/api/admin/years').then(r => r.json()),
      fetch('/api/admin/grades').then(r => r.json()),
      fetch('/api/admin/subjects').then(r => r.json()),
      fetch('/api/admin/exam-types').then(r => r.json())
    ]);

    // Years
    const tbodyY = document.querySelector('#tblYears tbody');
    tbodyY.innerHTML = years.map(y => `<tr><td>${y.id}</td><td><strong>${y.name}</strong></td></tr>`).join('');

    // Grades
    const tbodyG = document.querySelector('#tblGrades tbody');
    tbodyG.innerHTML = grades.map(g => `<tr><td>${g.id}</td><td><strong>${g.name}</strong></td></tr>`).join('');

    // Subjects
    const tbodyS = document.querySelector('#tblSubjects tbody');
    tbodyS.innerHTML = subjects.map(s => `<tr><td>${s.id}</td><td><strong>${s.name}</strong></td></tr>`).join('');

    // Exam Types
    const tbodyT = document.querySelector('#tblExamTypes tbody');
    tbodyT.innerHTML = types.map(t => `<tr><td>${t.id}</td><td><strong>${t.name}</strong></td></tr>`).join('');
  } catch (err) {
    console.error('Failed to load settings lists', err);
  }
}

// ==========================================
// SYSTEM BACKUPS & AUDIT LOGS
// ==========================================
function initBackupsAndLogs() {
  document.getElementById('btnCreateBackup').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/backups', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Backup created successfully: ${data.filename}`);
        loadBackupsTable();
      } else {
        alert('Backup failed.');
      }
    } catch (err) {
      alert('Backup connection error.');
    }
  });
}

async function loadBackupsTable() {
  try {
    const res = await fetch('/api/admin/backups');
    const backups = await res.json();
    const tbody = document.querySelector('#tblBackups tbody');
    tbody.innerHTML = '';
    
    if (backups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No backups found. Click "Create DB Backup" to back up.</td></tr>';
    } else {
      backups.forEach(b => {
        const sizeKb = (b.size / 1024).toFixed(1);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><code>${b.filename}</code></td>
          <td>${sizeKb} KB</td>
          <td>${new Date(b.created_at).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Failed to load backups', err);
  }
}

async function loadAuditLogsTable() {
  try {
    const res = await fetch('/api/admin/audit-logs');
    const logs = await res.json();
    const tbody = document.querySelector('#tblAudit tbody');
    tbody.innerHTML = '';
    
    logs.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(l.created_at).toLocaleString()}</td>
        <td><span class="badge badge-info">${l.event_type}</span></td>
        <td><strong>${l.username || 'System/Candidate'}</strong></td>
        <td><code>${l.ip_address || '-'}</code></td>
        <td>${l.details}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load audit logs', err);
  }
}
