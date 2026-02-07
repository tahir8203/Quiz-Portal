import { db } from "./firebase.js";
import { state } from "./state.js";
import { qs, safeText, formatQuizLabel } from "./utils.js";

let currentAttemptId = null;

export function bindGradingHandlers() {
  qs("#btn-save-grades").addEventListener("click", saveGrades);
}

export async function loadPendingGrades() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const list = qs("#grading-list");
  const detail = qs("#grading-detail");
  list.innerHTML = "";
  detail.innerHTML = "Select a student to grade.";
  qs("#btn-save-grades").classList.add("hidden");

  if (!classKey || !semesterKey) {
    list.textContent = "Select class and semester.";
    return;
  }

  const teacherUid = state.teacherProfile?.uid || "";
  const snap = await db.collection("quizAttempts")
    .where("teacherUid", "==", teacherUid)
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .where("graded", "==", false)
    .get();

  if (snap.empty) {
    list.textContent = "No pending theory grading.";
    return;
  }

  snap.forEach((doc) => {
    const data = doc.data();
    const submittedAt = data.submittedAt?.toDate ? data.submittedAt.toDate().toLocaleString() : "N/A";
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${safeText(data.roll)} - ${safeText(data.name)} (${formatQuizLabel(data.quizNumber)})</span>
      <span>Submitted: ${safeText(submittedAt)}</span>
      <button class="btn btn-secondary">Grade</button>
    `;
    row.querySelector("button").addEventListener("click", () => openAttempt(doc.id, data));
    list.appendChild(row);
  });
}

function openAttempt(attemptId, data) {
  currentAttemptId = attemptId;
  const detail = qs("#grading-detail");
  detail.innerHTML = "";
  const submittedAt = data.submittedAt?.toDate ? data.submittedAt.toDate().toLocaleString() : "N/A";
  const header = document.createElement("div");
  header.className = "list-item";
  header.innerHTML = `<strong>Submitted:</strong> ${safeText(submittedAt)}`;
  detail.appendChild(header);
  const questions = data.questionsSnapshot || [];

  questions.forEach((q, idx) => {
    if (q.type !== "theory") return;
    const wrapper = document.createElement("div");
    wrapper.className = "list-item";
    wrapper.innerHTML = `
      <div>
        <div><strong>Q${idx + 1}:</strong> ${safeText(q.text)}</div>
        <div><em>Answer:</em> ${safeText(data.answers?.[idx])}</div>
        <label>Marks (max ${q.marks || 0})</label>
        <input class="grade-input" type="number" min="0" max="${q.marks || 0}" data-max="${q.marks || 0}" value="0" />
      </div>
    `;
    detail.appendChild(wrapper);
  });

  qs("#btn-save-grades").classList.remove("hidden");
}

async function saveGrades() {
  if (!currentAttemptId) return;
  const inputs = Array.from(document.querySelectorAll(".grade-input"));
  let theoryScore = 0;
  let theoryMax = 0;
  inputs.forEach((input) => {
    const max = Number(input.dataset.max || 0);
    let val = Number(input.value || 0);
    if (val > max) val = max;
    if (val < 0) val = 0;
    theoryScore += val;
    theoryMax += max;
  });

  const attemptRef = db.collection("quizAttempts").doc(currentAttemptId);
  const attemptDoc = await attemptRef.get();
  if (!attemptDoc.exists) return;
  const data = attemptDoc.data();
  const totalScore = (data.mcqScore || 0) + theoryScore;

  await attemptRef.update({
    theoryScore,
    theoryMax,
    totalScore,
    graded: true,
    gradedAt: new Date()
  });

  currentAttemptId = null;
  qs("#grading-detail").innerHTML = "Select a student to grade.";
  qs("#btn-save-grades").classList.add("hidden");
  loadPendingGrades();
}
