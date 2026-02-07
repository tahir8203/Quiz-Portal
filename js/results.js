import { db } from "./firebase.js";
import { state } from "./state.js";
import { qs, downloadCsv, safeText, formatQuizLabel, setOptions } from "./utils.js";

export function bindResultsHandlers() {
  qs("#btn-refresh-results").addEventListener("click", loadResults);
  qs("#btn-export-results").addEventListener("click", exportResults);
  qs("#results-quiz-filter").addEventListener("change", loadResults);
}

export function initResultsFilter() {
  const options = [{ key: "", name: "All Quizzes" }].concat(
    Array.from({ length: 6 }, (_, i) => ({ key: String(i + 1), name: formatQuizLabel(i + 1) }))
  );
  setOptions(qs("#results-quiz-filter"), options, "name");
}

export async function loadResults() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const tbody = qs("#results-body");
  if (!classKey || !semesterKey) {
    tbody.innerHTML = "<tr><td colspan=\"5\">Select class and semester.</td></tr>";
    return;
  }

  const quizFilter = qs("#results-quiz-filter").value;
  const teacherUid = state.teacherProfile?.uid || "";
  let query = db.collection("quizAttempts")
    .where("teacherUid", "==", teacherUid)
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey);
  if (quizFilter) {
    query = query.where("quizNumber", "==", Number(quizFilter));
  }
  const snap = await query.get();

  tbody.innerHTML = "";
  if (snap.empty) {
    tbody.innerHTML = "<tr><td colspan=\"5\">No results.</td></tr>";
    updateAnalytics([]);
    return;
  }

  const attempts = snap.docs.map((doc) => doc.data());
  attempts.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  updateAnalytics(attempts);

  attempts.forEach((attempt) => {
    const submittedAt = attempt.submittedAt?.toDate ? attempt.submittedAt.toDate().toLocaleString() : "N/A";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${safeText(attempt.roll)}</td>
      <td>${safeText(attempt.name)}</td>
      <td>${formatQuizLabel(attempt.quizNumber)}</td>
      <td>${attempt.totalScore ?? "Pending"}</td>
      <td>${safeText(submittedAt)}</td>
      <td>${attempt.graded ? "Graded" : "Pending"}</td>
    `;
    tbody.appendChild(row);
  });

  updateQuestionAnalytics(attempts);
}

async function exportResults() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const quizFilter = qs("#results-quiz-filter").value;
  const teacherUid = state.teacherProfile?.uid || "";
  let query = db.collection("quizAttempts")
    .where("teacherUid", "==", teacherUid)
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey);
  if (quizFilter) {
    query = query.where("quizNumber", "==", Number(quizFilter));
  }
  const snap = await query.get();

  if (snap.empty) {
    alert("No results to export");
    return;
  }

  const rows = [
    ["Roll", "Name", "Quiz", "Score", "Status"]
  ];
  snap.forEach((doc) => {
    const data = doc.data();
    rows.push([
      data.roll,
      data.name,
      formatQuizLabel(data.quizNumber),
      data.totalScore ?? "Pending",
      data.graded ? "Graded" : "Pending"
    ]);
  });

  const filename = quizFilter ? `quiz-${quizFilter}-results.csv` : "quiz-results.csv";
  downloadCsv(filename, rows);
}

function updateAnalytics(attempts) {
  const attemptCount = attempts.length;
  const pendingCount = attempts.filter((a) => !a.graded).length;
  const scored = attempts.filter((a) => typeof a.totalScore === "number");
  const total = scored.reduce((sum, a) => sum + (a.totalScore || 0), 0);
  const average = scored.length ? (total / scored.length) : 0;
  const highest = scored.length ? Math.max(...scored.map((a) => a.totalScore || 0)) : 0;

  qs("#stat-attempts").textContent = attemptCount;
  qs("#stat-average").textContent = average.toFixed(2);
  qs("#stat-pending").textContent = pendingCount;
  qs("#stat-highest").textContent = highest;
}

function updateQuestionAnalytics(attempts) {
  const container = qs("#question-analytics");
  container.innerHTML = "";
  if (!attempts.length) {
    container.textContent = "No attempts to analyze.";
    return;
  }
  const first = attempts.find((a) => Array.isArray(a.questionsSnapshot) && a.questionsSnapshot.length);
  if (!first) {
    container.textContent = "No question data available.";
    return;
  }
  const questions = first.questionsSnapshot;
  const stats = questions.map(() => ({ total: 0, correct: 0 }));
  attempts.forEach((attempt) => {
    if (!Array.isArray(attempt.questionsSnapshot) || !Array.isArray(attempt.answers)) return;
    attempt.questionsSnapshot.forEach((q, idx) => {
      if (q.type !== "mcq") return;
      stats[idx].total += 1;
      if (attempt.answers[idx] === q.correct) stats[idx].correct += 1;
    });
  });

  questions.forEach((q, idx) => {
    if (q.type !== "mcq") return;
    const total = stats[idx].total;
    const correct = stats[idx].correct;
    const rate = total ? ((correct / total) * 100).toFixed(1) : "0.0";
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>Q${idx + 1}: ${safeText(q.text)}</span>
      <span>Correct: ${correct}/${total} (${rate}%)</span>
    `;
    container.appendChild(row);
  });
}
