// CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyD7bzc9CPZzAl9OGHrT5jnO2eljJaDh7zE",
  authDomain: "pgcquiz.firebaseapp.com",
  projectId: "pgcquiz",
  storageBucket: "pgcquiz.firebasestorage.app",
  messagingSenderId: "421283264016",
  appId: "1:421283264016:web:82c44b4ae0d22fb2443c95"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const TEACHER_PIN = "2102025"; 
let quizDraft = [];
let activeQuiz = [];
let studentAnswers = [];
let currentQIndex = 0;
let isQuizRunning = false;
let studentInfo = { name: "", rollNo: "", className: "", id: "" };
let quizTimerInterval = null;
let currentGradingDocId = null;

// NAV
function showTeacherLogin() { document.getElementById('main-menu').classList.add('hidden'); document.getElementById('teacher-login-screen').classList.remove('hidden'); document.getElementById('public-nav').classList.add('hidden'); }
function showStudentLogin() { document.getElementById('main-menu').classList.add('hidden'); document.getElementById('student-login').classList.remove('hidden'); document.getElementById('public-nav').classList.add('hidden'); }
function verifyTeacher() {
    if (document.getElementById('teacher-pin').value === TEACHER_PIN) {
        document.getElementById('teacher-login-screen').classList.add('hidden');
        document.getElementById('teacher-dashboard').classList.remove('hidden');
        document.getElementById('teacher-nav').classList.remove('hidden');
    } else alert("Incorrect PIN");
}
function switchTab(tab) {
    document.querySelectorAll('.section-view').forEach(el => el.classList.add('hidden'));
    if(tab==='quiz') document.getElementById('section-quiz').classList.remove('hidden');
    if(tab==='assign') { document.getElementById('section-assign').classList.remove('hidden'); checkAssignmentStatus(); }
    if(tab==='grading') document.getElementById('section-grading').classList.remove('hidden');
}
function switchStudentTab(tab) {
    document.getElementById('student-quiz-view').classList.add('hidden');
    document.getElementById('student-assign-view').classList.add('hidden');
    if(tab==='quiz') document.getElementById('student-quiz-view').classList.remove('hidden');
    if(tab==='assign') { document.getElementById('student-assign-view').classList.remove('hidden'); loadStudentAssignments(); }
}

// CRITICAL FIX: RESET DRAFT ON CHANGE
function refreshDashboard() {
    quizDraft = [];
    document.getElementById('q-count').innerText = "0";
    document.getElementById('q-text').value = ""; 
    document.getElementById('q-image-input').value = "";
    document.getElementById('opt1').value = ""; document.getElementById('opt2').value = "";
    document.getElementById('opt3').value = ""; document.getElementById('opt4').value = "";
    checkQuizStatus(); checkAssignmentStatus();
}

// EDITOR
function getBase64(file) {
   return new Promise((resolve, reject) => {
     const reader = new FileReader();
     reader.readAsDataURL(file);
     reader.onload = () => resolve(reader.result);
     reader.onerror = error => reject(error);
   });
}
function toggleQuestionInputs() {
    const type = document.getElementById('q-type-select').value;
    if(type === 'mcq') { document.getElementById('mcq-inputs').classList.remove('hidden'); document.getElementById('theory-inputs').classList.add('hidden'); } 
    else { document.getElementById('mcq-inputs').classList.add('hidden'); document.getElementById('theory-inputs').classList.remove('hidden'); }
}
async function handleSmartPaste() {
    try {
        const text = await navigator.clipboard.readText();
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if(lines.length === 4) {
            for(let i=0; i<4; i++) document.getElementById(`opt${i+1}`).value = lines[i].trim();
            alert("Pasted Options!");
        } else if(lines.length >= 5) {
            document.getElementById('q-text').value = lines[0].trim();
            for(let i=0; i<4; i++) document.getElementById(`opt${i+1}`).value = lines[i+1].trim();
            alert("Pasted Question + Options!");
        } else alert("Need 4 or 5 lines");
    } catch(e) { alert("Paste failed"); }
}
async function addQuestionToDraft() {
    const type = document.getElementById('q-type-select').value;
    const qText = document.getElementById('q-text').value;
    const file = document.getElementById('q-image-input');
    if(!qText) return alert("Enter Question");
    let img = ""; if(file.files.length) img = await getBase64(file.files[0]);
    let newQ = { question: qText, image: img, type: type };
    if(type === 'mcq') {
        const o1 = document.getElementById('opt1').value; const o2 = document.getElementById('opt2').value;
        const o3 = document.getElementById('opt3').value; const o4 = document.getElementById('opt4').value;
        const c = document.getElementById('correct-opt').value;
        if(!o1 || !c) return alert("Fill Options");
        newQ.options = [o1,o2,o3,o4]; newQ.correct = parseInt(c); newQ.maxMarks = 1;
    } else {
        const m = document.getElementById('theory-marks').value;
        if(!m) return alert("Enter Marks");
        newQ.maxMarks = parseInt(m);
    }
    quizDraft.push(newQ);
    document.getElementById('q-count').innerText = quizDraft.length;
    // Clear
    document.getElementById('q-text').value=""; document.getElementById('q-image-input').value="";
    if(type==='mcq') { for(let i=1;i<=4;i++) document.getElementById(`opt${i}`).value=""; }
}

// DRAFTS
function saveDraft() {
    const cls = document.getElementById('teacher-class-select').value;
    const id = document.getElementById('control-id').value;
    if(!cls) return alert("Select Class");
    if(!quizDraft.length) return alert("Empty");
    db.collection("quiz_drafts").doc(`${cls}_Quiz${id}`).set({ questionsList: quizDraft }).then(()=>alert("Saved!"));
}
function loadDraft() {
    const cls = document.getElementById('teacher-class-select').value;
    const id = document.getElementById('control-id').value;
    if(!cls) return alert("Select Class");
    db.collection("quiz_drafts").doc(`${cls}_Quiz${id}`).get().then(doc => {
        if(doc.exists) { quizDraft = doc.data().questionsList; document.getElementById('q-count').innerText = quizDraft.length; alert("Loaded!"); }
        else alert("No Draft");
    });
}
function deleteSavedDraft() {
    const cls = document.getElementById('teacher-class-select').value;
    const id = document.getElementById('control-id').value;
    if(confirm("Delete?")) db.collection("quiz_drafts").doc(`${cls}_Quiz${id}`).delete().then(()=>alert("Deleted"));
}
function openDraftPreview() {
    const div = document.getElementById('draft-list-container'); div.innerHTML = "";
    quizDraft.forEach((q, i) => {
        div.innerHTML += `<div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
            <div><b>Q${i+1}:</b> ${q.question}</div>
            <div><button class="btn btn-secondary w-auto" onclick="editQ(${i})" style="padding:2px 6px;">✎</button> <button class="btn btn-danger w-auto" onclick="removeQ(${i})" style="padding:2px 6px;">✕</button></div>
        </div>`;
    });
    document.getElementById('draft-modal').classList.remove('hidden');
}
function editQ(i) {
    const q = quizDraft[i];
    document.getElementById('q-type-select').value = q.type; toggleQuestionInputs();
    document.getElementById('q-text').value = q.question;
    if(q.type==='mcq') { for(let k=0;k<4;k++) document.getElementById(`opt${k+1}`).value = q.options[k]; document.getElementById('correct-opt').value = q.correct; }
    else document.getElementById('theory-marks').value = q.maxMarks;
    quizDraft.splice(i, 1); document.getElementById('q-count').innerText = quizDraft.length; closeDraftPreview();
}
function closeDraftPreview() { document.getElementById('draft-modal').classList.add('hidden'); }
function removeQ(i) { quizDraft.splice(i,1); document.getElementById('q-count').innerText = quizDraft.length; openDraftPreview(); }

// LIVE
function checkQuizStatus() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    if(!cls) return;
    db.collection("active_quiz").doc(`${cls}_Quiz${id}`).get().then(doc => {
        const el = document.getElementById('status-display');
        if(doc.exists) { el.innerText="🟢 LIVE"; el.style.color="var(--success)"; } else { el.innerText="🔴 OFFLINE"; el.style.color="var(--danger)"; }
    });
}
function goLive() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    const t = document.getElementById('quiz-timer-input').value;
    if(!cls) return alert("Select Class"); if(!quizDraft.length) return alert("Draft Empty");
    db.collection("quiz_drafts").doc(`${cls}_Quiz${id}`).set({ questionsList: quizDraft });
    db.collection("active_quiz").doc(`${cls}_Quiz${id}`).set({ questionsList: quizDraft, timerMinutes: t ? parseInt(t) : null }).then(() => { alert("Live!"); checkQuizStatus(); });
}
function stopQuiz() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    if(confirm("Stop?")) db.collection("active_quiz").doc(`${cls}_Quiz${id}`).delete().then(()=>{ alert("Stopped"); checkQuizStatus(); });
}

// ASSIGNMENTS
function checkAssignmentStatus() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    if(!cls) return;
    db.collection("assignments").doc(`${cls}_Assign${id}`).get().then(doc => {
        if(doc.exists) {
            const d = doc.data(); document.getElementById('assign-title').value=d.title; document.getElementById('assign-link').value=d.link; document.getElementById('assign-date').value=d.dueDate;
            document.getElementById('assign-status-box').classList.remove('hidden'); document.getElementById('btn-delete-assign').classList.remove('hidden');
        } else {
            document.getElementById('assign-title').value=""; document.getElementById('assign-link').value=""; document.getElementById('assign-date').value="";
            document.getElementById('assign-status-box').classList.add('hidden'); document.getElementById('btn-delete-assign').classList.add('hidden');
        }
    });
}
function postAssignment() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    const t = document.getElementById('assign-title').value; const l = document.getElementById('assign-link').value; const d = document.getElementById('assign-date').value;
    if(!cls || !t) return alert("Missing Info");
    db.collection("assignments").doc(`${cls}_Assign${id}`).set({ className:cls, title:t, link:l, dueDate:d }).then(()=>{ alert("Posted"); checkAssignmentStatus(); });
}
function deleteAssignment() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    db.collection("assignments").doc(`${cls}_Assign${id}`).delete().then(()=>{ alert("Deleted"); checkAssignmentStatus(); });
}

// STUDENT
function enterStudentDashboard() {
    const n = document.getElementById('student-name').value; const r = document.getElementById('student-roll').value; const c = document.getElementById('student-class-select').value; const id = document.getElementById('student-quiz-id').value;
    if(!n || !r || !c) return alert("Fill all");
    studentInfo = { name:n, rollNo:r, className:c, id:id };
    document.getElementById('student-login').classList.add('hidden'); document.getElementById('student-dashboard').classList.remove('hidden'); document.getElementById('student-nav').classList.remove('hidden');
}
function startStudentQuiz() {
    db.collection("results").where("rollNo","==",studentInfo.rollNo).get().then(snap => {
        let taken = false; snap.forEach(doc => { if(doc.data().className === studentInfo.className && doc.data().quizId === studentInfo.id) taken = true; });
        if(taken) alert("Done already!"); else loadQuizData(studentInfo.id);
    });
}
function loadQuizData(id) {
    db.collection("active_quiz").doc(`${studentInfo.className}_Quiz${id}`).get().then(doc => {
        if(!doc.exists) return alert("Not Active");
        activeQuiz = doc.data().questionsList; studentAnswers = new Array(activeQuiz.length).fill(null); isQuizRunning = true; currentQIndex = 0;
        document.getElementById('quiz-start-card').classList.add('hidden'); document.getElementById('quiz-interface').classList.remove('hidden');
        if(doc.data().timerMinutes) startTimer(doc.data().timerMinutes); startAntiCheat(); renderQuestion();
    });
}
function renderQuestion() {
    const q = activeQuiz[currentQIndex];
    document.getElementById('question-counter').innerText = `Q${currentQIndex+1}/${activeQuiz.length}`;
    document.getElementById('display-question').innerText = q.question;
    const img = document.getElementById('display-image');
    if(q.image) { img.src=q.image; img.classList.remove('hidden'); } else img.classList.add('hidden');
    
    if(q.type === 'mcq') {
        document.getElementById('theory-area').classList.add('hidden'); document.getElementById('answer-area').innerHTML = "";
        for(let i=0; i<4; i++) {
            const btn = document.createElement('button'); btn.className = 'opt-btn'; btn.innerText = q.options[i];
            if(studentAnswers[currentQIndex] === (i+1)) btn.classList.add('selected-opt');
            btn.onclick = () => { studentAnswers[currentQIndex] = i+1; renderQuestion(); };
            document.getElementById('answer-area').appendChild(btn);
        }
    } else {
        document.getElementById('answer-area').innerHTML = ""; document.getElementById('theory-area').classList.remove('hidden');
        document.getElementById('theory-text-input').value = studentAnswers[currentQIndex] || "";
    }
    document.getElementById('btn-prev').disabled = (currentQIndex===0);
    if(currentQIndex === activeQuiz.length-1) { document.getElementById('btn-next').classList.add('hidden'); document.getElementById('btn-submit').classList.remove('hidden'); }
    else { document.getElementById('btn-next').classList.remove('hidden'); document.getElementById('btn-submit').classList.add('hidden'); }
}
function saveTheoryInput() { studentAnswers[currentQIndex] = document.getElementById('theory-text-input').value; }
function nextQuestion() { if(currentQIndex < activeQuiz.length-1) { currentQIndex++; renderQuestion(); } }
function prevQuestion() { if(currentQIndex > 0) { currentQIndex--; renderQuestion(); } }

function finishQuiz(forced=false) {
    if(quizTimerInterval) clearInterval(quizTimerInterval); isQuizRunning = false;
    let score = 0, total = 0, hasTheory = false;
    activeQuiz.forEach((q,i) => {
        total += q.maxMarks;
        if(q.type==='mcq' && studentAnswers[i]===q.correct) score++;
        if(q.type==='theory') hasTheory = true;
    });
    db.collection("results").add({
        ...studentInfo, quizId: studentInfo.id, answers: studentAnswers,
        mcqScore: score, theoryScore: 0, totalScore: score, totalMax: total, isGraded: !hasTheory,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(), questionsSnapshot: activeQuiz
    });
    document.getElementById('quiz-interface').classList.add('hidden'); document.getElementById('score-screen').classList.remove('hidden');
    document.getElementById('mcq-final-score').innerText = score;
    document.getElementById('theory-final-score').innerText = hasTheory ? "Pending" : "0";
    document.getElementById('total-final-score').innerText = hasTheory ? "Pending" : `${score}/${total}`;
    document.getElementById('final-status-text').innerText = hasTheory ? "Grading Pending" : "Complete";
    renderReview();
}

function toggleReview() { document.getElementById('review-container').classList.toggle('hidden'); }
function renderReview() {
    const d = document.getElementById('review-list'); d.innerHTML = "";
    activeQuiz.forEach((q, i) => {
        let ans = studentAnswers[i]; let right = (ans === q.correct);
        let cls = right ? 'review-correct' : 'review-wrong';
        if(q.type==='theory') cls = ""; 
        d.innerHTML += `<div class="review-card ${cls}"><p><b>Q${i+1}:</b> ${q.question}</p><p>Ans: ${ans||"None"}</p></div>`;
    });
}

// UTILS
function startTimer(m) {
    let s = m * 60; document.getElementById('timer-box').classList.remove('hidden');
    quizTimerInterval = setInterval(() => {
        s--; document.getElementById('time-val').innerText = `${Math.floor(s/60)}:${s%60}`;
        if(s<=0) { clearInterval(quizTimerInterval); finishQuiz(); }
    }, 1000);
}
function startAntiCheat() {
    document.addEventListener("visibilitychange", () => { if(isQuizRunning && document.hidden) { alert("Cheating detected!"); finishQuiz(true); } });
}
function loadStudentAssignments() {
    const d = document.getElementById('student-assign-list'); d.innerHTML="Loading...";
    const ids=["1","2","3","4"]; d.innerHTML="";
    ids.forEach(id=>{
        db.collection("assignments").doc(`${studentInfo.className}_Assign${id}`).get().then(doc=>{
            if(doc.exists) { const data=doc.data(); d.innerHTML+=`<div class="card" style="padding:15px; border-left:4px solid blue;"><h4>${data.title}</h4><p>Due: ${data.dueDate}</p><a href="${data.link}" target="_blank" class="btn btn-primary w-auto">Open</a></div>`; }
        });
    });
}

// GRADING
function openGradingPanel() { document.getElementById('grading-modal').classList.remove('hidden'); loadPendingGrades(); }
function closeGradingPanel() { document.getElementById('grading-modal').classList.add('hidden'); }
function loadPendingGrades() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    const div = document.getElementById('grading-student-list'); div.innerHTML="Loading...";
    db.collection("results").where("className","==",cls).where("quizId","==",id).where("isGraded","==",false).get().then(snap => {
        div.innerHTML=""; if(snap.empty) div.innerHTML="None pending.";
        snap.forEach(doc => { div.innerHTML+=`<div style="padding:10px; border:1px solid #ddd; margin:5px 0; cursor:pointer;" onclick="loadGradeDetail('${doc.id}')">${doc.data().rollNo} - ${doc.data().name}</div>`; });
    });
}
function loadGradeDetail(did) {
    currentGradingDocId = did; document.getElementById('grading-list-view').classList.add('hidden'); document.getElementById('grading-detail-view').classList.remove('hidden');
    const box = document.getElementById('grading-questions-container'); box.innerHTML="Loading...";
    db.collection("results").doc(did).get().then(doc => {
        const d = doc.data(); document.getElementById('grading-student-name').innerText = d.name;
        let qs = d.questionsSnapshot;
        if(!qs) { box.innerHTML="Err: No Snapshot"; return; }
        box.innerHTML="";
        qs.forEach((q,i) => {
            if(q.type==='theory') box.innerHTML+=`<div style="background:#f9f9f9; padding:10px; margin-bottom:10px;"><p><b>Q:</b> ${q.question}</p><p><b>Ans:</b> ${d.answers[i]}</p><input type="number" class="grade-input" max="${q.maxMarks}" placeholder="Marks"></div>`;
        });
    });
}
function saveStudentGrade() {
    let t = 0; document.querySelectorAll('.grade-input').forEach(i => t+=parseInt(i.value)||0);
    db.collection("results").doc(currentGradingDocId).get().then(doc=>{
        db.collection("results").doc(currentGradingDocId).update({ theoryScore:t, totalScore:doc.data().mcqScore+t, isGraded:true }).then(()=>{ alert("Saved"); backToGradingList(); });
    });
}
function backToGradingList() { document.getElementById('grading-detail-view').classList.add('hidden'); document.getElementById('grading-list-view').classList.remove('hidden'); loadPendingGrades(); }

// RESULTS
function loadResults() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    const tb = document.getElementById('results-body'); tb.innerHTML="<tr><td>Loading...</td></tr>";
    db.collection("results").where("className","==",cls).where("quizId","==",id).get().then(snap => {
        tb.innerHTML=""; let arr=[]; snap.forEach(d=>arr.push(d.data())); arr.sort((a,b)=>b.totalScore-a.totalScore);
        arr.forEach(d => tb.innerHTML+=`<tr><td>${d.rollNo}</td><td>${d.name}</td><td>${d.isGraded?d.totalScore:"Pending"}</td><td>${d.isGraded?"✅":"⚠️"}</td></tr>`);
    });
}
function exportToExcel() {
    let rows = Array.from(document.getElementById("results-table").rows);
    let csv = rows.map(r => Array.from(r.cells).map(c => c.innerText).join(",")).join("\n");
    let blob = new Blob([csv], { type: "text/csv" });
    let a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Results.csv"; a.click();
}
function clearClassResults() {
    const cls = document.getElementById('teacher-class-select').value; const id = document.getElementById('control-id').value;
    if(confirm("Delete All?")) {
        db.collection("results").where("className","==",cls).where("quizId","==",id).get().then(snap => {
            let b = db.batch(); snap.docs.forEach(d=>b.delete(d.ref)); b.commit().then(()=>alert("Cleared"));
        });
    }
}