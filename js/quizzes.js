import { db, serverTimestamp } from "./firebase.js";
import { state } from "./state.js";
import { qs, setOptions, formatQuizLabel, safeText } from "./utils.js";

let draftQuestions = [];
let activeQuiz = null;
let answers = [];
let currentIndex = 0;
let questionTimer = null;
let lockedQuestions = [];
let remainingTime = [];
let progressKey = null;
let progressInterval = null;
let editIndex = null;
let draftAutosaveTimer = null;

const quizNumberSelect = qs("#quiz-number");
const studentQuizSelect = qs("#student-quiz-number");

export function initQuizSelectors() {
  const options = Array.from({ length: 6 }, (_, i) => ({ key: String(i + 1), name: formatQuizLabel(i + 1) }));
  setOptions(quizNumberSelect, options, "name");
  setOptions(studentQuizSelect, options, "name");
}

export function bindQuizHandlers() {
  qs("#question-type").addEventListener("change", toggleQuestionFields);
  qs("#btn-add-question").addEventListener("click", addQuestion);
  qs("#btn-cancel-edit").addEventListener("click", cancelEdit);
  qs("#btn-smart-paste").addEventListener("click", handleSmartPaste);
  qs("#btn-save-draft").addEventListener("click", saveDraft);
  qs("#btn-load-draft").addEventListener("click", loadDraft);
  qs("#btn-delete-draft").addEventListener("click", deleteDraft);
  qs("#btn-publish-quiz").addEventListener("click", publishQuiz);
  qs("#btn-archive-quiz").addEventListener("click", archiveQuiz);
  qs("#btn-restore-quiz").addEventListener("click", restoreQuiz);

  qs("#btn-start-quiz").addEventListener("click", startStudentQuiz);
  qs("#btn-prev-question").addEventListener("click", () => changeQuestion(-1));
  qs("#btn-next-question").addEventListener("click", () => changeQuestion(1));
  qs("#btn-submit-quiz").addEventListener("click", submitQuiz);
}

export async function viewAttempt(attemptId) {
  const doc = await db.collection("quizAttempts").doc(attemptId).get();
  if (!doc.exists) return;
  const data = doc.data();
  const questions = data.questionsSnapshot || [];
  const answersList = data.answers || [];
  qs("#quiz-interface").classList.add("hidden");
  renderReview(questions, answersList);
}

function toggleQuestionFields() {
  const type = qs("#question-type").value;
  if (type === "mcq") {
    qs("#mcq-options").classList.remove("hidden");
    qs("#theory-fields").classList.add("hidden");
  } else {
    qs("#mcq-options").classList.add("hidden");
    qs("#theory-fields").classList.remove("hidden");
  }
}

async function addQuestion() {
  const type = qs("#question-type").value;
  const text = qs("#question-text").value.trim();
  const timerSec = parseInt(qs("#question-timer").value, 10);
  const imageInput = qs("#question-image");
  if (!text) {
    alert("Enter a question");
    return;
  }

  const question = { type, text, timerSec: Number.isFinite(timerSec) ? timerSec : null, imageUrl: "" };

  if (type === "mcq") {
    const options = [
      qs("#opt-1").value.trim(),
      qs("#opt-2").value.trim(),
      qs("#opt-3").value.trim(),
      qs("#opt-4").value.trim()
    ];
    const correct = qs("#correct-option").value;
    if (options.some((opt) => !opt) || !correct) {
      alert("Complete all options and correct choice");
      return;
    }
    question.options = options;
    question.correct = Number(correct);
    question.marks = 1;
  } else {
    const marks = parseInt(qs("#theory-marks").value, 10);
    if (!Number.isFinite(marks)) {
      alert("Enter marks");
      return;
    }
    question.marks = marks;
  }

  if (imageInput.files && imageInput.files.length) {
    const file = imageInput.files[0];
    const base64 = await fileToBase64(file);
    question.imageData = base64;
  } else if (editIndex !== null && draftQuestions[editIndex]?.imageData) {
    question.imageData = draftQuestions[editIndex].imageData;
  }

  if (editIndex !== null) {
    draftQuestions[editIndex] = question;
  } else {
    draftQuestions.push(question);
  }
  qs("#question-text").value = "";
  qs("#question-timer").value = "";
  qs("#correct-option").value = "";
  qs("#opt-1").value = "";
  qs("#opt-2").value = "";
  qs("#opt-3").value = "";
  qs("#opt-4").value = "";
  qs("#theory-marks").value = "";
  qs("#question-image").value = "";
  editIndex = null;
  qs("#btn-add-question").textContent = "Add Question";
  renderDraftPreview();
  scheduleDraftAutosave();
}

function renderDraftPreview() {
  const container = qs("#draft-preview");
  container.innerHTML = "";
  if (!draftQuestions.length) {
    container.textContent = "No draft questions.";
    return;
  }
  draftQuestions.forEach((q, idx) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>Q${idx + 1}: ${safeText(q.text)}</span>
      <div class="list-actions">
        <button class="btn btn-secondary" data-view="${idx}">View</button>
        <button class="btn btn-secondary" data-edit="${idx}">Edit</button>
        <button class="btn btn-danger" data-delete="${idx}">Delete</button>
      </div>
    `;
    row.querySelector("[data-view]").addEventListener("click", () => viewQuestion(idx));
    row.querySelector("[data-edit]").addEventListener("click", () => editQuestion(idx));
    row.querySelector("[data-delete]").addEventListener("click", () => {
      draftQuestions.splice(idx, 1);
      renderDraftPreview();
      scheduleDraftAutosave();
    });
    container.appendChild(row);
  });
}

async function saveDraft(silent = false) {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const quizNumber = quizNumberSelect.value;
  const title = qs("#quiz-title").value.trim();

  if (!classKey || !semesterKey || !quizNumber) {
    alert("Select class, semester, and quiz number");
    return;
  }
  if (!draftQuestions.length) {
    alert("Add questions first");
    return;
  }

  const docKey = makeQuizKey(classKey, semesterKey, quizNumber);
  await db.collection("quizzes").doc(docKey).set({
    classKey,
    semesterKey,
    quizNumber: Number(quizNumber),
    title: title || formatQuizLabel(quizNumber),
    status: "draft",
    questions: draftQuestions,
    archived: false,
    archivedAt: null,
    restoredAt: null,
    updatedAt: serverTimestamp()
  }, { merge: true });

  if (!silent) alert("Draft saved");
  loadArchivedQuizzes();
}

async function loadDraft() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const quizNumber = quizNumberSelect.value;
  if (!classKey || !semesterKey || !quizNumber) {
    alert("Select class, semester, and quiz number");
    return;
  }
  const docKey = makeQuizKey(classKey, semesterKey, quizNumber);
  const doc = await db.collection("quizzes").doc(docKey).get();
  if (!doc.exists) {
    alert("No draft found");
    return;
  }
  draftQuestions = doc.data().questions || [];
  qs("#quiz-title").value = doc.data().title || "";
  editIndex = null;
  qs("#btn-add-question").textContent = "Add Question";
  renderDraftPreview();
  loadArchivedQuizzes();
}

async function deleteDraft() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const quizNumber = quizNumberSelect.value;
  if (!classKey || !semesterKey || !quizNumber) {
    alert("Select class, semester, and quiz number");
    return;
  }
  const docKey = makeQuizKey(classKey, semesterKey, quizNumber);
  await db.collection("quizzes").doc(docKey).delete();
  draftQuestions = [];
  editIndex = null;
  qs("#btn-add-question").textContent = "Add Question";
  renderDraftPreview();
  loadArchivedQuizzes();
}

async function publishQuiz() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const quizNumber = quizNumberSelect.value;
  if (!classKey || !semesterKey || !quizNumber) {
    alert("Select class, semester, and quiz number");
    return;
  }
  if (!draftQuestions.length) {
    alert("Add questions first");
    return;
  }
  const docKey = makeQuizKey(classKey, semesterKey, quizNumber);
  await db.collection("quizzes").doc(docKey).set({
    status: "published",
    publishedAt: serverTimestamp(),
    questions: draftQuestions,
    archived: false,
    archivedAt: null,
    restoredAt: null
  }, { merge: true });
  alert("Quiz published");
  loadArchivedQuizzes();
}

function editQuestion(index) {
  const q = draftQuestions[index];
  editIndex = index;
  qs("#question-type").value = q.type;
  toggleQuestionFields();
  qs("#question-text").value = q.text;
  qs("#question-timer").value = q.timerSec || "";
  qs("#question-image").value = "";
  if (q.type === "mcq") {
    qs("#opt-1").value = q.options?.[0] || "";
    qs("#opt-2").value = q.options?.[1] || "";
    qs("#opt-3").value = q.options?.[2] || "";
    qs("#opt-4").value = q.options?.[3] || "";
    qs("#correct-option").value = String(q.correct || "");
  } else {
    qs("#theory-marks").value = q.marks || "";
  }
  qs("#btn-add-question").textContent = "Update Question";
}

function viewQuestion(index) {
  const q = draftQuestions[index];
  let details = `Question: ${q.text}\nType: ${q.type}\nTimer: ${q.timerSec || "None"}\nMarks: ${q.marks || 1}`;
  if (q.type === "mcq") {
    details += `\nOptions:\n1) ${q.options[0]}\n2) ${q.options[1]}\n3) ${q.options[2]}\n4) ${q.options[3]}\nCorrect: Option ${q.correct}`;
  }
  alert(details);
}

function cancelEdit() {
  editIndex = null;
  qs("#btn-add-question").textContent = "Add Question";
  qs("#question-text").value = "";
  qs("#question-timer").value = "";
  qs("#correct-option").value = "";
  qs("#opt-1").value = "";
  qs("#opt-2").value = "";
  qs("#opt-3").value = "";
  qs("#opt-4").value = "";
  qs("#theory-marks").value = "";
  qs("#question-image").value = "";
}

function hasDraftContext() {
  return state.currentClassKey && state.currentSemesterKey && quizNumberSelect.value;
}

function scheduleDraftAutosave() {
  if (draftAutosaveTimer) clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = setTimeout(() => {
    if (draftQuestions.length && hasDraftContext()) {
      saveDraft(true);
    }
  }, 1500);
}

async function handleSmartPaste() {
  try {
    const text = await navigator.clipboard.readText();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
    if (lines.length === 4) {
      qs("#opt-1").value = lines[0];
      qs("#opt-2").value = lines[1];
      qs("#opt-3").value = lines[2];
      qs("#opt-4").value = lines[3];
      alert("Options pasted.");
      return;
    }
    if (lines.length >= 5) {
      qs("#question-text").value = lines[0];
      qs("#opt-1").value = lines[1];
      qs("#opt-2").value = lines[2];
      qs("#opt-3").value = lines[3];
      qs("#opt-4").value = lines[4];
      alert("Question and options pasted.");
      return;
    }
    alert("Clipboard needs 4 lines (options) or 5 lines (question + options).");
  } catch (err) {
    alert("Clipboard access failed.");
  }
}

async function startStudentQuiz() {
  if (!state.studentProfile) return;
  const quizNumber = studentQuizSelect.value;
  if (!quizNumber) {
    alert("Select a quiz number");
    return;
  }

  const classKey = state.studentProfile.classKey;
  const semesterKey = state.studentProfile.semesterKey;
  const attemptKey = makeAttemptKey(classKey, semesterKey, quizNumber, state.studentProfile.roll);
  progressKey = attemptKey;
  const attemptDoc = await db.collection("quizAttempts").doc(attemptKey).get();
  if (attemptDoc.exists) {
    alert("You already attempted this quiz");
    return;
  }

  const quizDocKey = makeQuizKey(classKey, semesterKey, quizNumber);
  const quizDoc = await db.collection("quizzes").doc(quizDocKey).get();
  if (!quizDoc.exists || quizDoc.data().status !== "published" || quizDoc.data().archived) {
    alert("Quiz not available");
    return;
  }

  activeQuiz = quizDoc.data();
  const progressDoc = await db.collection("quizProgress").doc(progressKey).get();
  if (progressDoc.exists) {
    const progress = progressDoc.data();
    answers = progress.answers || new Array(activeQuiz.questions.length).fill(null);
    lockedQuestions = progress.lockedQuestions || new Array(activeQuiz.questions.length).fill(false);
    remainingTime = progress.remainingTime || activeQuiz.questions.map((q) => (q.timerSec ? q.timerSec : null));
    currentIndex = progress.currentIndex || 0;
  } else {
    answers = new Array(activeQuiz.questions.length).fill(null);
    lockedQuestions = new Array(activeQuiz.questions.length).fill(false);
    remainingTime = activeQuiz.questions.map((q) => (q.timerSec ? q.timerSec : null));
    currentIndex = 0;
  }
  qs("#quiz-interface").classList.remove("hidden");
  qs("#quiz-review").classList.add("hidden");
  startProgressAutosave();
  renderQuestion();
}

async function archiveQuiz() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const quizNumber = quizNumberSelect.value;
  if (!classKey || !semesterKey || !quizNumber) return;
  const docKey = makeQuizKey(classKey, semesterKey, quizNumber);
  await db.collection("quizzes").doc(docKey).set({ archived: true, archivedAt: serverTimestamp() }, { merge: true });
  loadArchivedQuizzes();
}

async function restoreQuiz() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const quizNumber = quizNumberSelect.value;
  if (!classKey || !semesterKey || !quizNumber) return;
  const docKey = makeQuizKey(classKey, semesterKey, quizNumber);
  await db.collection("quizzes").doc(docKey).set({ archived: false, restoredAt: serverTimestamp() }, { merge: true });
  loadArchivedQuizzes();
}

export async function loadArchivedQuizzes() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const list = qs("#archived-quizzes");
  list.innerHTML = "";
  if (!classKey || !semesterKey) {
    list.textContent = "Select class and semester.";
    return;
  }
  const snap = await db.collection("quizzes")
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .where("archived", "==", true)
    .get();
  if (snap.empty) {
    list.textContent = "No archived quizzes.";
    return;
  }
  snap.forEach((doc) => {
    const data = doc.data();
    const row = document.createElement("div");
    row.className = "list-item";
    const archivedAt = data.archivedAt?.toDate ? data.archivedAt.toDate().toLocaleString() : "N/A";
    row.innerHTML = `
      <span>${formatQuizLabel(data.quizNumber)} (Archived: ${archivedAt})</span>
      <button class="btn btn-secondary" data-restore="${doc.id}">Restore</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      await db.collection("quizzes").doc(doc.id).set({ archived: false }, { merge: true });
      loadArchivedQuizzes();
    });
    list.appendChild(row);
  });
}

function renderQuestion() {
  clearTimer();
  const question = activeQuiz.questions[currentIndex];
  qs("#question-counter").textContent = `Question ${currentIndex + 1} of ${activeQuiz.questions.length}`;
  qs("#quiz-question").textContent = question.text;
  const imageEl = qs("#quiz-image");
  if (question.imageData) {
    imageEl.src = question.imageData;
    imageEl.classList.remove("hidden");
  } else {
    imageEl.classList.add("hidden");
  }
  const optionsContainer = qs("#quiz-options");
  const theoryBox = qs("#quiz-theory");
  optionsContainer.innerHTML = "";

  if (question.type === "mcq") {
    theoryBox.classList.add("hidden");
    question.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-secondary";
      btn.textContent = opt;
      const alreadySelected = answers[currentIndex] === idx + 1;
      if (alreadySelected) {
        btn.classList.add("btn-primary");
      }
      btn.disabled = lockedQuestions[currentIndex] || alreadySelected;
      btn.addEventListener("click", () => {
        if (answers[currentIndex] !== null) return;
        answers[currentIndex] = idx + 1;
        lockedQuestions[currentIndex] = true;
        clearTimer();
        saveProgress();
        renderQuestion();
      });
      optionsContainer.appendChild(btn);
    });
  } else {
    theoryBox.classList.remove("hidden");
    theoryBox.value = answers[currentIndex] || "";
    theoryBox.disabled = lockedQuestions[currentIndex];
    theoryBox.oninput = () => {
      answers[currentIndex] = theoryBox.value;
      saveProgress();
    };
  }

  qs("#btn-prev-question").disabled = currentIndex === 0;
  qs("#btn-next-question").disabled = currentIndex === activeQuiz.questions.length - 1;

  if (question.timerSec && !lockedQuestions[currentIndex]) {
    const timeLeft = remainingTime[currentIndex];
    if (timeLeft && timeLeft > 0) {
      startQuestionTimer(currentIndex);
    } else {
      qs("#question-timer-display").textContent = "Time: 0s";
      lockedQuestions[currentIndex] = true;
    }
  } else {
    qs("#question-timer-display").textContent = "";
  }
}

function changeQuestion(direction) {
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= activeQuiz.questions.length) return;
  currentIndex = nextIndex;
  saveProgress();
  renderQuestion();
}

function startQuestionTimer(index) {
  let remaining = remainingTime[index];
  qs("#question-timer-display").textContent = `Time: ${remaining}s`;
  questionTimer = setInterval(() => {
    remaining -= 1;
    remainingTime[index] = remaining;
    qs("#question-timer-display").textContent = `Time: ${remaining}s`;
    if (remaining <= 0) {
      clearTimer();
      lockedQuestions[index] = true;
      if (currentIndex < activeQuiz.questions.length - 1) {
        currentIndex += 1;
        renderQuestion();
      }
    }
  }, 1000);
}

function clearTimer() {
  if (questionTimer) {
    clearInterval(questionTimer);
    questionTimer = null;
  }
}

async function submitQuiz() {
  if (!state.studentProfile) return;
  clearTimer();
  const classKey = state.studentProfile.classKey;
  const semesterKey = state.studentProfile.semesterKey;
  const quizNumber = studentQuizSelect.value;
  const attemptKey = makeAttemptKey(classKey, semesterKey, quizNumber, state.studentProfile.roll);

  let score = 0;
  let total = 0;
  let hasTheory = false;
  let theoryMax = 0;
  activeQuiz.questions.forEach((q, idx) => {
    total += q.marks || 1;
    if (q.type === "mcq" && answers[idx] === q.correct) {
      score += q.marks || 1;
    }
    if (q.type === "theory") {
      hasTheory = true;
      theoryMax += q.marks || 0;
    }
  });

  await db.collection("quizAttempts").doc(attemptKey).set({
    classKey,
    semesterKey,
    quizNumber: Number(quizNumber),
    studentUid: state.studentProfile.uid || state.user.uid,
    roll: state.studentProfile.roll,
    name: state.studentProfile.name,
    answers,
    questionsSnapshot: activeQuiz.questions,
    mcqScore: score,
    theoryScore: 0,
    totalScore: score,
    maxScore: total,
    theoryMax,
    graded: !hasTheory,
    submittedAt: serverTimestamp()
  });

  stopProgressAutosave();
  await db.collection("quizProgress").doc(attemptKey).delete();
  qs("#quiz-interface").classList.add("hidden");
  renderReview(activeQuiz.questions, answers);
  document.dispatchEvent(new Event("student-results-updated"));
}

function startProgressAutosave() {
  stopProgressAutosave();
  progressInterval = setInterval(saveProgress, 5000);
  window.addEventListener("beforeunload", saveProgress);
}

function stopProgressAutosave() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  window.removeEventListener("beforeunload", saveProgress);
}

function saveProgress() {
  if (!progressKey || !activeQuiz) return;
  db.collection("quizProgress").doc(progressKey).set({
    classKey: state.studentProfile.classKey,
    semesterKey: state.studentProfile.semesterKey,
    quizNumber: Number(studentQuizSelect.value || 0),
    studentUid: state.user.uid,
    roll: state.studentProfile.roll,
    answers,
    lockedQuestions,
    remainingTime,
    currentIndex,
    updatedAt: new Date()
  }, { merge: true });
}

function renderReview(questions, answersList) {
  const review = qs("#quiz-review");
  review.classList.remove("hidden");
  review.innerHTML = "";
  questions.forEach((q, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "list-item";
    let resultClass = "";
    if (q.type === "mcq") {
      const correct = answersList[idx] === q.correct;
      resultClass = correct ? "review-correct" : "review-wrong";
    }
    let answerText = safeText(answersList[idx]);
    let correctText = "";
    if (q.type === "mcq") {
      const answerIndex = answersList[idx] ? answersList[idx] - 1 : -1;
      const correctIndex = q.correct ? q.correct - 1 : -1;
      answerText = answerIndex >= 0 ? safeText(q.options[answerIndex]) : "No answer";
      correctText = correctIndex >= 0 ? safeText(q.options[correctIndex]) : "";
    }
    wrapper.innerHTML = `
      <div class="${resultClass}">
        <strong>Q${idx + 1}:</strong> ${safeText(q.text)}
        <div>Answer: ${answerText}</div>
        ${q.type === "mcq" ? `<div>Correct: ${correctText}</div>` : ""}
      </div>
    `;
    review.appendChild(wrapper);
  });
}

function makeQuizKey(classKey, semesterKey, quizNumber) {
  return `${classKey}_${semesterKey}_quiz_${quizNumber}`;
}

function makeAttemptKey(classKey, semesterKey, quizNumber, roll) {
  return `${classKey}_${semesterKey}_quiz_${quizNumber}_roll_${roll}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
