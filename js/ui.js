import { qs, qsa, show, hide } from "./utils.js";

export const screens = {
  public: qs("#public-screen"),
  teacherLogin: qs("#teacher-login-screen"),
  studentLogin: qs("#student-login-screen"),
  teacherDash: qs("#teacher-dashboard"),
  studentDash: qs("#student-dashboard")
};

const tabButtons = qsa(".tab-btn");

export function initTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest("section");
      const tab = btn.dataset.tab;
      qsa(".tab-btn", group).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      qsa(".tab-panel", group).forEach((panel) => {
        if (panel.id === tab) {
          show(panel);
        } else {
          hide(panel);
        }
      });
    });
  });
}

export function showPublicScreen() {
  show(screens.public);
  hide(screens.teacherLogin);
  hide(screens.studentLogin);
  hide(screens.teacherDash);
  hide(screens.studentDash);
}

export function showTeacherLogin() {
  hide(screens.public);
  show(screens.teacherLogin);
  hide(screens.studentLogin);
  hide(screens.teacherDash);
  hide(screens.studentDash);
}

export function showStudentLogin() {
  hide(screens.public);
  hide(screens.teacherLogin);
  show(screens.studentLogin);
  hide(screens.teacherDash);
  hide(screens.studentDash);
}

export function showTeacherDashboard() {
  hide(screens.public);
  hide(screens.teacherLogin);
  hide(screens.studentLogin);
  show(screens.teacherDash);
  hide(screens.studentDash);
}

export function showStudentDashboard() {
  hide(screens.public);
  hide(screens.teacherLogin);
  hide(screens.studentLogin);
  hide(screens.teacherDash);
  show(screens.studentDash);
}

export function setTopbarButtons({ showTeacherSwitch, showStudentSwitch, showSignOut }) {
  const toTeacher = qs("#btn-to-teacher-login");
  const toStudent = qs("#btn-to-student-login");
  const signOut = qs("#btn-sign-out");

  if (showTeacherSwitch) show(toTeacher); else hide(toTeacher);
  if (showStudentSwitch) show(toStudent); else hide(toStudent);
  if (showSignOut) show(signOut); else hide(signOut);
}
