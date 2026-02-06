import { bindAuthHandlers, initAuthListener } from "./auth.js";
import { initTabs, showTeacherLogin, showStudentLogin, showPublicScreen, setTopbarButtons } from "./ui.js";
import { bindClassHandlers, loadClassSemesterOptions } from "./classes.js";
import { bindQuizHandlers, initQuizSelectors, viewAttempt, loadArchivedQuizzes } from "./quizzes.js";
import { bindAssignmentHandlers, initAssignmentSelectors, loadArchivedAssignments } from "./assignments.js";
import { bindEnrollmentHandlers, loadEnrollmentList } from "./enrollment.js";
import { bindResultsHandlers, loadResults, initResultsFilter } from "./results.js";
import { bindGradingHandlers, loadPendingGrades } from "./grading.js";
import { showAdminTabIfAllowed, loadPendingTeachers } from "./admin.js";
import { bindStudentResultsHandlers, loadStudentResults } from "./studentResults.js";
import { ensureXlsx } from "./xlsxLoader.js";
import { loadStudentEnrollmentOptions } from "./studentEnrollment.js";
import { qs } from "./utils.js";
import { state } from "./state.js";

bindAuthHandlers();
initAuthListener();
initTabs();

bindClassHandlers();
bindQuizHandlers();
bindAssignmentHandlers();
bindEnrollmentHandlers();
bindResultsHandlers();
bindGradingHandlers();
showAdminTabIfAllowed();
bindStudentResultsHandlers(async (attemptId) => {
  await viewAttempt(attemptId);
  switchStudentTab("student-quizzes");
});
ensureXlsx();
initResultsFilter();

initQuizSelectors();
initAssignmentSelectors();

loadClassSemesterOptions().then(() => {
  loadEnrollmentList();
  loadPendingGrades();
  loadResults();
  loadArchivedQuizzes();
  loadArchivedAssignments();
});

document.addEventListener("classes-updated", () => {
  loadClassSemesterOptions();
});

qs("#btn-open-teacher").addEventListener("click", () => {
  showTeacherLogin();
  setTopbarButtons({ showTeacherSwitch: false, showStudentSwitch: false, showSignOut: false });
});
qs("#btn-open-student").addEventListener("click", () => {
  showStudentLogin();
  setTopbarButtons({ showTeacherSwitch: false, showStudentSwitch: false, showSignOut: false });
});

qs("#btn-to-teacher-login").addEventListener("click", showTeacherLogin);
qs("#btn-to-student-login").addEventListener("click", showStudentLogin);
qs("#admin-tab-btn").addEventListener("click", loadPendingTeachers);

qs("#student-class").addEventListener("change", loadStudentEnrollmentOptions);
qs("#student-semester").addEventListener("change", loadStudentEnrollmentOptions);

qs("#teacher-class").addEventListener("change", () => {
  state.currentClassKey = qs("#teacher-class").value;
  loadEnrollmentList();
  loadPendingGrades();
  loadResults();
  loadArchivedQuizzes();
  loadArchivedAssignments();
});
qs("#teacher-semester").addEventListener("change", () => {
  state.currentSemesterKey = qs("#teacher-semester").value;
  loadEnrollmentList();
  loadPendingGrades();
  loadResults();
  loadArchivedQuizzes();
  loadArchivedAssignments();
});

document.addEventListener("student-profile-ready", (event) => {
  const profile = event.detail;
  qs("#student-class-display").textContent = profile.classKey;
  qs("#student-semester-display").textContent = profile.semesterKey;
  qs("#profile-name").textContent = profile.name;
  qs("#profile-roll").textContent = profile.roll;
  loadStudentResults();
});

document.addEventListener("student-results-updated", () => {
  loadStudentResults();
});

document.addEventListener("teacher-profile-ready", () => {
  showAdminTabIfAllowed();
  loadPendingTeachers();
});

showPublicScreen();

function switchStudentTab(tabId) {
  const studentSection = qs("#student-dashboard");
  const buttons = studentSection.querySelectorAll(".tab-btn");
  const panels = studentSection.querySelectorAll(".tab-panel");
  buttons.forEach((btn) => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  panels.forEach((panel) => {
    if (panel.id === tabId) {
      panel.classList.remove("hidden");
    } else {
      panel.classList.add("hidden");
    }
  });
}
