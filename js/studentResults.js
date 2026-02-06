import { db } from "./firebase.js";
import { state } from "./state.js";
import { qs, safeText, formatQuizLabel } from "./utils.js";

export function bindStudentResultsHandlers(onViewAttempt) {
  qs("#student-results").addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-attempt]");
    if (!btn) return;
    onViewAttempt(btn.dataset.attempt);
  });
}

export async function loadStudentResults() {
  const container = qs("#student-results");
  container.innerHTML = "";
  if (!state.user || !state.studentProfile) {
    container.textContent = "Login to view results.";
    return;
  }

  const snap = await db.collection("quizAttempts")
    .where("studentUid", "==", state.user.uid)
    .get();

  if (snap.empty) {
    container.textContent = "No results yet.";
    return;
  }

  const attempts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  attempts.sort((a, b) => {
    const ta = a.submittedAt?.toDate ? a.submittedAt.toDate().getTime() : 0;
    const tb = b.submittedAt?.toDate ? b.submittedAt.toDate().getTime() : 0;
    return tb - ta;
  });

  attempts.forEach((attempt) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${formatQuizLabel(attempt.quizNumber)} - Score: ${attempt.totalScore ?? "Pending"} (${attempt.graded ? "Graded" : "Pending"})</span>
      <button class="btn btn-secondary" data-attempt="${attempt.id}">View</button>
    `;
    container.appendChild(row);
  });
}
