import { auth, db, serverTimestamp } from "./firebase.js";
import { state } from "./state.js";
import { showTeacherDashboard, showStudentDashboard, showPublicScreen, setTopbarButtons } from "./ui.js";
import { qs } from "./utils.js";

export function bindAuthHandlers() {
  qs("#btn-teacher-login").addEventListener("click", teacherLogin);
  qs("#btn-teacher-signup").addEventListener("click", teacherSignup);
  qs("#btn-student-login").addEventListener("click", studentLogin);
  qs("#btn-sign-out").addEventListener("click", signOutUser);
}

export function initAuthListener() {
  auth.onAuthStateChanged(async (user) => {
    state.user = user;
    if (!user) {
      state.role = null;
      state.teacherProfile = null;
      state.studentProfile = null;
      setTopbarButtons({ showTeacherSwitch: false, showStudentSwitch: false, showSignOut: false });
      showPublicScreen();
      return;
    }

    const teacherDoc = await db.collection("teachers").doc(user.uid).get();
    if (teacherDoc.exists) {
      const teacherData = teacherDoc.data();
      if (teacherData.active === false) {
        await auth.signOut();
        alert("Teacher account pending approval.");
        return;
      }
      state.role = "teacher";
      state.teacherProfile = teacherData;
      document.dispatchEvent(new CustomEvent("teacher-profile-ready", { detail: teacherData }));
      showTeacherDashboard();
      setTopbarButtons({ showTeacherSwitch: true, showStudentSwitch: true, showSignOut: true });
      return;
    }

    const studentDoc = await db.collection("students").doc(user.uid).get();
    if (studentDoc.exists) {
      state.role = "student";
      state.studentProfile = { uid: user.uid, ...studentDoc.data() };
      document.dispatchEvent(new CustomEvent("student-profile-ready", { detail: state.studentProfile }));
      showStudentDashboard();
      setTopbarButtons({ showTeacherSwitch: true, showStudentSwitch: true, showSignOut: true });
      return;
    }

    showPublicScreen();
  });
}

async function teacherLogin() {
  const email = qs("#teacher-email").value.trim();
  const password = qs("#teacher-password").value.trim();
  if (!email || !password) {
    alert("Enter email and password");
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    alert(err.message || "Login failed");
  }
}

async function teacherSignup() {
  const email = qs("#teacher-email").value.trim();
  const password = qs("#teacher-password").value.trim();
  if (!email || !password) {
    alert("Enter email and password");
    return;
  }
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("teachers").doc(result.user.uid).set({
      email,
      createdAt: serverTimestamp(),
      active: false,
      role: "teacher",
      assignedClasses: []
    });
  } catch (err) {
    alert(err.message || "Signup failed");
  }
}

async function studentLogin() {
  const classKey = qs("#student-class").value;
  const semesterKey = qs("#student-semester").value;
  const name = qs("#student-name-select").value.trim();
  const roll = qs("#student-roll-select").value.trim();
  if (!classKey || !semesterKey || !name || !roll) {
    alert("Complete all fields");
    return;
  }

  try {
    const cred = await auth.signInAnonymously();
    const enrollmentSnap = await db.collection("enrollments")
      .where("classKey", "==", classKey)
      .where("semesterKey", "==", semesterKey)
      .where("roll", "==", roll)
      .get();

    if (enrollmentSnap.empty) {
      await auth.signOut();
      alert("You are not enrolled in this class and semester");
      return;
    }

    const enrollment = enrollmentSnap.docs[0].data();
    if (enrollment.name.toLowerCase() !== name.toLowerCase()) {
      await auth.signOut();
      alert("Name does not match enrollment record");
      return;
    }

    await db.collection("students").doc(cred.user.uid).set({
      uid: cred.user.uid,
      name,
      roll,
      classKey,
      semesterKey,
      enrollmentKey: enrollmentSnap.docs[0].id,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    alert(err.message || "Student login failed");
  }
}

async function signOutUser() {
  await auth.signOut();
}
