// ═══════════════════════════════════════════════════════════════════════════
//  D-MATHS TUITION CENTRE — Google Apps Script Backend
//  Paste this ENTIRE file into the Apps Script editor, then deploy as a
//  Web App (Execute as: Me | Access: Anyone).  Copy the deployment URL
//  into your HTML file's  SHEET_API  constant.
//
//  SHEET TABS REQUIRED (create these in your Google Spreadsheet):
//    1. Applications   — enrolment requests from the sign-up form
//    2. Students       — approved student accounts
//    3. Classes        — class schedule
//    4. Assignments    — homework / assessments
//    5. Notices        — announcements
//    6. Scores         — per-student subject scores
//    7. Attendance     — attendance records
//    8. Contacts       — contact-form messages
//    9. AdminNotes     — notes written by admin per student
//   10. Credentials    — admin login (email | password hashed)
//
//  QUICK SETUP — after creating the spreadsheet:
//    1. Open your Google Sheet
//    2. Extensions → Apps Script
//    3. Paste this code (replace any existing code)
//    4. Click the floppy-disk  💾 Save
//    5. Run  setupSheets()  once to create all tab headers
//    6. Deploy → New Deployment → Web App
//        Execute as: Me
//        Who has access: Anyone
//    7. Copy the Web App URL → paste into your HTML's SHEET_API
// ═══════════════════════════════════════════════════════════════════════════

// ─── Spreadsheet ID ───────────────────────────────────────────────────────
// After "https://docs.google.com/spreadsheets/d/" grab the ID segment.
// Paste it below. If you leave this blank the script uses the active sheet.
const SPREADSHEET_ID = '';  // e.g. '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms'

// ─── Admin credentials (change these!) ────────────────────────────────────
const ADMIN_EMAIL    = 'admin@dmaths.edu.gh';
const ADMIN_PASSWORD = 'Admin@2024!';      // plain text for simplicity
                                             // upgrade to hashed in production

const TOKEN_SECRET = 'change-this-before-production';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function sha256(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}
function safeEqual(a,b){
  const sa=String(a||''), sb=String(b||'');
  let diff = sa.length ^ sb.length;
  for(let i=0;i<Math.max(sa.length,sb.length);i++) diff |= (sa.charCodeAt(i)||0) ^ (sb.charCodeAt(i)||0);
  return diff===0;
}
function maybeHashPassword(pw){
  const v=String(pw||'');
  return /^[0-9a-f]{64}$/.test(v) ? v : sha256(v);
}
function generateToken(subject, role){
  const payload = JSON.stringify({sub:String(subject||''), role:String(role||'user'), iat:Date.now(), exp:Date.now()+TOKEN_TTL_MS});
  const payloadB64 = Utilities.base64EncodeWebSafe(payload);
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, TOKEN_SECRET));
  return payloadB64 + '.' + sig;
}
function validateToken(token){
  try{
    const parts=String(token||'').split('.');
    if(parts.length!==2) return null;
    const payloadB64=parts[0], providedSig=parts[1];
    const expectedSig=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, TOKEN_SECRET));
    if(!safeEqual(providedSig, expectedSig)) return null;
    const payload=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString());
    if(Date.now() > Number(payload.exp||0)) return null;
    return payload;
  }catch(e){ return null; }
}
function authRequired(action){
  const pub=['studentLogin','adminLogin','submitApplication','addApp','sendContact','setup'];
  return pub.indexOf(action)===-1;
}
function parseList(value){
  if(Array.isArray(value)) return value;
  const raw=String(value||'').trim();
  if(!raw) return [];
  try{ const parsed=JSON.parse(raw); if(Array.isArray(parsed)) return parsed; }catch(e){}
  return raw.split(',').map(s=>s.trim()).filter(Boolean);
}

// ─── CORS & entry points ───────────────────────────────────────────────────
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Parse params from both GET and POST
  let params = {};
  try {
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch(ex) {}
  Object.assign(params, e.parameter || {});

  const action = params.action || '';
  let result;

  try {
    if (authRequired(action)) {
      const tokenPayload = validateToken(params._token || params.token);
      if (!tokenPayload) {
        return ContentService.createTextOutput(JSON.stringify({ success:false, error:'Unauthorized' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    switch (action) {
      // ── Auth ──────────────────────────────────────────────
      case 'studentLogin':
        result = studentLogin(params.studentId, params.password);
        break;
      case 'adminLogin':
        result = adminLogin(params.email, params.password);
        break;

      // ── Applications ──────────────────────────────────────
      case 'submitApplication':
      case 'addApp':
        result = submitApplication(params);
        break;
      case 'getApplications':
        result = { success:true, data: getSheet('Applications').toObjects() };
        break;
      case 'approveApplication':
      case 'approveApp':
      case 'updateAppStatus':
        result = approveApplication(params.id || params.appId);
        break;
      case 'rejectApplication':
      case 'rejectApp':
        result = rejectApplication(params.id || params.appId);
        break;

      // ── Students ──────────────────────────────────────────
      case 'getStudents':
        result = { success:true, data: getSheet('Students').toObjects() };
        break;
      case 'addStudent':
        result = addStudent(params);
        break;
      case 'updateStudent':
        result = updateStudent(params.id, params);
        break;

      // ── Classes ───────────────────────────────────────────
      case 'getClasses':
        result = { success:true, data: getSheet('Classes').toObjects() };
        break;
      case 'addClass':
        result = addClass(params);
        break;

      // ── Assignments ───────────────────────────────────────
      case 'getAssignments':
        result = { success:true, data: getSheet('Assignments').toObjects() };
        break;
      case 'addAssignment':
        result = addAssignment(params);
        break;
      case 'gradeAssignment':
        result = gradeAssignment(params.id, params.grade, params.feedback);
        break;

      // ── Notices ───────────────────────────────────────────
      case 'getNotices':
        result = { success:true, data: getSheet('Notices').toObjects() };
        break;
      case 'addNotice':
        result = addNotice(params);
        break;

      // ── Scores ────────────────────────────────────────────
      case 'getScores':
        result = { success:true, data: getSheet('Scores').toObjects() };
        break;
      case 'updateScore':
        result = updateScore(params.studentId, params.subject, params.score, params.month);
        break;

      // ── Admin Notes ───────────────────────────────────────
      case 'getNotes':
        result = getAdminNotes(params.studentId);
        break;
      case 'addNote':
        result = addAdminNote(params.studentId, params.note);
        break;

      // ── Attendance ────────────────────────────────────────
      case 'markAttendance':
        result = markAttendance(params.studentId, params.classId, params.date, params.present);
        break;

      // ── Contact form ──────────────────────────────────────
      case 'sendContact':
        result = saveContact(params);
        break;

      // ── Setup (run once) ──────────────────────────────────
      case 'setup':
        setupSheets();
        result = { success:true, message:'Sheets created successfully' };
        break;

      default:
        result = { success:false, error:'Unknown action: ' + action };
    }
  } catch(err) {
    result = { success:false, error: err.message };
    Logger.log('Error in action ' + action + ': ' + err.message);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHEET HELPER
// ═══════════════════════════════════════════════════════════════════════════
function getSpreadsheet() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  // Attach helper methods
  sheet.toObjects = function() {
    const data = this.getDataRange().getValues();
    if (data.length < 2) return [];
    const headers = data[0];
    return data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });
  };
  sheet.findRow = function(colName, value) {
    const data = this.getDataRange().getValues();
    const headers = data[0];
    const colIdx = headers.indexOf(colName);
    if (colIdx === -1) return -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colIdx]) === String(value)) return i + 1; // 1-indexed row
    }
    return -1;
  };
  sheet.updateRow = function(rowNum, colName, value) {
    const data = this.getRange(1, 1, 1, this.getLastColumn()).getValues()[0];
    const colIdx = data.indexOf(colName);
    if (colIdx !== -1) {
      this.getRange(rowNum, colIdx + 1).setValue(value);
    }
  };
  return sheet;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP — Run this once to create all sheet headers
// ═══════════════════════════════════════════════════════════════════════════
function setupSheets() {
  const config = {
    Applications: ['id','firstName','lastName','email','phone','level','subjects','guardian','guardianContact','paymentRef','paymentMethod','paymentAmt','paymentDate','status','applied','notes'],
    Students:     ['id','firstName','lastName','email','phone','level','subjects','guardian','guardianContact','isActive','avgScore','attendance','password','createdAt'],
    Classes:      ['id','subject','tutor','day','time','duration','platform','link','students','recording','createdAt'],
    Assignments:  ['id','title','subject','dueDate','type','cbtLink','cbtStart','cbtEnd','instructions','assignedTo','status','grade','feedback','createdAt'],
    Notices:      ['id','title','body','date','target','createdAt'],
    Scores:       ['id','studentId','subject','month','score','createdAt'],
    Attendance:   ['id','studentId','classId','date','present','createdAt'],
    Contacts:     ['id','name','email','phone','subject','message','date'],
    AdminNotes:   ['id','studentId','note','createdAt'],
    Credentials:  ['email','passwordHash','role','createdAt'],
  };

  const ss = getSpreadsheet();
  Object.entries(config).forEach(([sheetName, headers]) => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    // Only write headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#0A1628')
        .setFontColor('#D4A017');
      sheet.setFrozenRows(1);
    }
  });

  // Seed admin credentials
  const credSheet = getSheet('Credentials');
  if (credSheet.getLastRow() <= 1) {
    credSheet.appendRow([ADMIN_EMAIL, sha256(ADMIN_PASSWORD), 'admin', new Date().toISOString()]);
  }

  Logger.log('✅ D-Maths sheets created successfully!');
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════════
function studentLogin(studentId, password) {
  const sheet = getSheet('Students');
  const row = sheet.findRow('id', studentId);
  if (row === -1) return { success:false, error:'Student ID not found' };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowData = data[row - 1];
  const obj = {};
  headers.forEach((h, i) => { obj[h] = rowData[i]; });

  if (!safeEqual(String(obj.password), maybeHashPassword(password))) {
    return { success:false, error:'Incorrect password' };
  }
  if (!obj.isActive || obj.isActive === 'FALSE' || obj.isActive === false) {
    return { success:false, error:'Account is not active' };
  }

  // Parse subjects (stored as comma-separated string)
  obj.subjects = String(obj.subjects || '').split(',').map(s=>s.trim()).filter(Boolean);
  delete obj.password; // never return password to client
  return { success:true, student: obj, token: generateToken(obj.id || studentId, 'student') };
}

function adminLogin(email, password) {
  const sheet = getSheet('Credentials');
  const row = sheet.findRow('email', email);
  if (row === -1) {
    // Fallback to hardcoded admin
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      return { success:true, admin:{ name:'Administrator', email, role:'admin' }, token: generateToken(email, 'admin') };
    }
    return { success:false, error:'Email not found' };
  }
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowData = data[row - 1];
  const obj = {};
  headers.forEach((h,i) => { obj[h] = rowData[i]; });

  if (!safeEqual(String(obj.passwordHash), maybeHashPassword(password))) {
    return { success:false, error:'Incorrect password' };
  }
  return { success:true, admin:{ name:'Administrator', email, role: obj.role || 'admin' }, token: generateToken(email, obj.role || 'admin') };
}

// ═══════════════════════════════════════════════════════════════════════════
//  APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════
function submitApplication(data) {
  const sheet = getSheet('Applications');
  const id = 'REQ-' + Date.now();
  const subjects = Array.isArray(data.subjects) ? data.subjects.join(',') : (data.subjects || '');

  sheet.appendRow([
    id,
    data.firstName || '', data.lastName || '',
    data.email || '',    data.phone || '',
    data.level || '',    subjects,
    data.guardian || '', data.guardianContact || '',
    data.paymentRef || '', data.paymentMethod || '',
    data.paymentAmt || '', data.paymentDate || '',
    'pending',           new Date().toISOString().split('T')[0],
    '',
  ]);

  // Send confirmation email (optional — remove if email is not set up)
  try {
    if (data.email) {
      MailApp.sendEmail({
        to: data.email,
        subject: 'D-Maths Tuition Centre — Application Received',
        htmlBody: `
          <h2 style="color:#0A1628">Application Received!</h2>
          <p>Dear <strong>${data.firstName}</strong>,</p>
          <p>Thank you for applying to D-Maths Tuition Centre. Your application (Ref: <strong>${id}</strong>) has been received and is under review.</p>
          <p>Our admin team will verify your payment and respond within <strong>24 hours</strong>.</p>
          <p>If approved, you will receive your Student ID and login credentials by email.</p>
          <br>
          <p>Warm regards,<br><strong>D-Maths Tuition Centre</strong></p>
        `,
      });
    }
  } catch(e) {
    Logger.log('Email failed: ' + e.message);
  }

  return { success:true, id };
}

function approveApplication(appId) {
  const appSheet = getSheet('Applications');
  const row = appSheet.findRow('id', appId);
  if (row === -1) return { success:false, error:'Application not found' };

  // Get application data
  const data = appSheet.getDataRange().getValues();
  const headers = data[0];
  const rowData = data[row - 1];
  const app = {};
  headers.forEach((h, i) => { app[h] = rowData[i]; });

  // Generate student ID
  const studentSheet = getSheet('Students');
  const existingCount = Math.max(studentSheet.getLastRow() - 1, 0);
  const studentId = 'DM-' + new Date().getFullYear() + '-' + String(existingCount + 1).padStart(4, '0');
  const tempPassword = 'dmaths' + Math.floor(1000 + Math.random() * 9000);

  // Create student account
  studentSheet.appendRow([
    studentId,
    app.firstName, app.lastName,
    app.email,     app.phone,
    app.level,     app.subjects,
    app.guardian,  app.guardianContact,
    true,          0, 0,
    sha256(tempPassword),
    new Date().toISOString(),
  ]);

  // Update application status
  appSheet.updateRow(row, 'status', 'approved');

  // Send approval email
  try {
    if (app.email) {
      MailApp.sendEmail({
        to: app.email,
        subject: 'D-Maths — Your Account Has Been Approved! 🎉',
        htmlBody: `
          <h2 style="color:#059669">Congratulations! Application Approved</h2>
          <p>Dear <strong>${app.firstName}</strong>,</p>
          <p>Your application to D-Maths Tuition Centre has been approved. Here are your login credentials:</p>
          <div style="background:#F0F9F4;border:1px solid #A7F3D0;border-radius:8px;padding:20px;margin:20px 0">
            <p><strong>Student ID:</strong> ${studentId}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            <p><strong>Portal URL:</strong> <a href="#">dmaths.edu.gh/portal</a></p>
          </div>
          <p><strong>Important:</strong> Please change your password after your first login.</p>
          <p>Welcome to D-Maths! We look forward to your success.</p>
          <br>
          <p>Warm regards,<br><strong>D-Maths Tuition Centre</strong></p>
        `,
      });
    }
  } catch(e) {
    Logger.log('Approval email failed: ' + e.message);
  }

  return { success:true, studentId, password: tempPassword };
}

function rejectApplication(appId) {
  const appSheet = getSheet('Applications');
  const row = appSheet.findRow('id', appId);
  if (row === -1) return { success:false, error:'Not found' };

  const data = appSheet.getDataRange().getValues();
  const headers = data[0];
  const rowData = data[row - 1];
  const app = {};
  headers.forEach((h, i) => { app[h] = rowData[i]; });

  appSheet.updateRow(row, 'status', 'rejected');

  // Notify applicant
  try {
    if (app.email) {
      MailApp.sendEmail({
        to: app.email,
        subject: 'D-Maths — Application Update',
        htmlBody: `
          <p>Dear <strong>${app.firstName}</strong>,</p>
          <p>Thank you for your interest in D-Maths Tuition Centre. Unfortunately, we were unable to verify your payment for application <strong>${appId}</strong>.</p>
          <p>Please contact us at <a href="mailto:info@dmaths.edu.gh">info@dmaths.edu.gh</a> or WhatsApp <strong>+233 24 000 1234</strong> for assistance.</p>
          <br>
          <p>D-Maths Tuition Centre</p>
        `,
      });
    }
  } catch(e) {}

  return { success:true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STUDENTS
// ═══════════════════════════════════════════════════════════════════════════
function addStudent(data) {
  const sheet = getSheet('Students');
  const id = data.id || ('DM-' + new Date().getFullYear() + '-' + String(sheet.getLastRow()).padStart(4,'0'));
  sheet.appendRow([
    id, data.firstName, data.lastName, data.email, data.phone,
    data.level, Array.isArray(data.subjects)?data.subjects.join(','):data.subjects,
    data.guardian, data.guardianContact,
    true, 0, 0, maybeHashPassword(data.password || 'dmaths123'), new Date().toISOString(),
  ]);
  return { success:true, id };
}

function updateStudent(id, updates) {
  const sheet = getSheet('Students');
  const row = sheet.findRow('id', id);
  if (row === -1) return { success:false, error:'Student not found' };
  Object.entries(updates).forEach(([k, v]) => {
    if (k !== 'id') sheet.updateRow(row, k, v);
  });
  return { success:true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLASSES
// ═══════════════════════════════════════════════════════════════════════════
function addClass(data) {
  const sheet = getSheet('Classes');
  const id = 'CLS-' + Date.now();
  sheet.appendRow([
    id, data.subject, data.tutor, data.day, data.time, data.duration,
    data.platform, data.link,
    Array.isArray(data.students)?data.students.join(','):data.students,
    '', new Date().toISOString(),
  ]);
  return { success:true, id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════
function addAssignment(data) {
  const sheet = getSheet('Assignments');
  const id = 'ASN-' + Date.now();
  const assignedTo = parseList(data.assignedTo);
  const type = data.type || 'Written';
  let cbtLink = data.cbtLink || '';
  if (cbtLink && !/^https?:\/\//i.test(cbtLink)) cbtLink = 'https://' + cbtLink;

  sheet.appendRow([
    id, data.title || '', data.subject || '', data.dueDate || '',
    type, cbtLink, data.cbtStart || '', data.cbtEnd || '',
    data.instructions || '', assignedTo.join(','),
    'Pending', '', '', new Date().toISOString(),
  ]);
  return { success:true, id };
}


function gradeAssignment(id, grade, feedback) {
  const sheet = getSheet('Assignments');
  const aid = id || '';
  const row = sheet.findRow('id', aid);
  if (row === -1) return { success:false, error:'Assignment not found' };
  sheet.updateRow(row, 'status', 'Graded');
  sheet.updateRow(row, 'grade', Number(grade) || 0);
  sheet.updateRow(row, 'feedback', feedback || '');
  return { success:true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  NOTICES
// ═══════════════════════════════════════════════════════════════════════════
function addNotice(data) {
  const sheet = getSheet('Notices');
  const id = 'NOT-' + Date.now();
  sheet.appendRow([
    id, data.title, data.body,
    new Date().toISOString().split('T')[0],
    data.target || 'all',
    new Date().toISOString(),
  ]);
  return { success:true, id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCORES & ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════
function updateScore(studentId, subject, score, month) {
  const sheet = getSheet('Scores');
  const id = 'SCR-' + Date.now();
  sheet.appendRow([id, studentId, subject, month || new Date().toLocaleDateString('en-GH',{month:'short'}), score, new Date().toISOString()]);

  // Recalculate and update average score on Students sheet
  const allScores = getSheet('Scores').toObjects().filter(r=>r.studentId===studentId).map(r=>parseFloat(r.score)).filter(n=>!isNaN(n));
  const avg = allScores.length ? Math.round(allScores.reduce((a,b)=>a+b,0)/allScores.length) : 0;
  updateStudent(studentId, { avgScore: avg });

  return { success:true, id, newAvg: avg };
}

function markAttendance(studentId, classId, date, present) {
  const sheet = getSheet('Attendance');
  const id = 'ATT-' + Date.now();
  sheet.appendRow([id, studentId, classId, date || new Date().toISOString().split('T')[0], present, new Date().toISOString()]);

  // Recalculate attendance % for student
  const allRec = getSheet('Attendance').toObjects().filter(r=>r.studentId===studentId);
  const presentCount = allRec.filter(r=>r.present==='TRUE'||r.present===true||r.present==='true').length;
  const pct = allRec.length ? Math.round(presentCount/allRec.length*100) : 0;
  updateStudent(studentId, { attendance: pct });

  return { success:true, id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN NOTES
// ═══════════════════════════════════════════════════════════════════════════
function getAdminNotes(studentId) {
  const notes = getSheet('AdminNotes').toObjects().filter(r=>r.studentId===studentId);
  return { success:true, data: notes };
}

function addAdminNote(studentId, note) {
  const sheet = getSheet('AdminNotes');
  const id = 'NOTE-' + Date.now();
  sheet.appendRow([id, studentId, note, new Date().toISOString()]);
  return { success:true, id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONTACT FORM
// ═══════════════════════════════════════════════════════════════════════════
function saveContact(data) {
  const sheet = getSheet('Contacts');
  const id = 'MSG-' + Date.now();
  sheet.appendRow([id, data.name, data.email, data.phone||'', data.subject||'', data.message||data.msg||'', new Date().toISOString()]);

  // Forward to admin inbox
  try {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: '[D-Maths Contact] ' + (data.subject || 'Website Message') + ' — ' + data.name,
      htmlBody: `
        <h3>New message from the D-Maths contact form</h3>
        <p><strong>Name:</strong> ${data.name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Phone:</strong> ${data.phone || '—'}</p>
        <p><strong>Subject:</strong> ${data.subject || '—'}</p>
        <p><strong>Message:</strong></p>
        <p>${data.message || data.msg}</p>
        <hr>
        <small>Sent via D-Maths website contact form on ${new Date().toLocaleString()}</small>
      `,
    });
  } catch(e) {
    Logger.log('Contact email failed: ' + e.message);
  }

  return { success:true, id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITY — Useful for manual testing in the Apps Script editor
// ═══════════════════════════════════════════════════════════════════════════

/** Run this manually to test the setup */
function testSetup() {
  setupSheets();
  Logger.log('Sheets ready ✅');
}

/** Run this manually to add a test application */
function testSubmitApplication() {
  const result = submitApplication({
    firstName:'Test', lastName:'Student', email:'test@example.com', phone:'+233 24 000 9999',
    level:'SHS 1', subjects:['Algebra','Calculus'], guardian:'Test Parent',
    guardianContact:'+233 20 000 8888', paymentRef:'TEST-001', paymentMethod:'MTN MoMo',
    paymentAmt:'450', paymentDate:'2024-02-19',
  });
  Logger.log(JSON.stringify(result));
}

/** Run this manually to test student login */
function testStudentLogin() {
  const r = studentLogin('DM-2024-0001','dmaths123');
  Logger.log(JSON.stringify(r));
}
