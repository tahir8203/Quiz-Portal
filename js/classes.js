import { db, serverTimestamp } from "./firebase.js";
import { state } from "./state.js";
import { qs, setOptions, safeText } from "./utils.js";

const classSelectTeacher = qs("#teacher-class");
const classSelectStudent = qs("#student-class");
const semesterSelectTeacher = qs("#teacher-semester");
const semesterSelectStudent = qs("#student-semester");

export function bindClassHandlers() {
  qs("#btn-add-class").addEventListener("click", addClass);
  qs("#btn-add-semester").addEventListener("click", addSemester);
  classSelectTeacher.addEventListener("change", () => { state.currentClassKey = classSelectTeacher.value; });
  semesterSelectTeacher.addEventListener("change", () => { state.currentSemesterKey = semesterSelectTeacher.value; });
}

export async function loadClassSemesterOptions() {
  const isAdmin = state.teacherProfile?.role === "admin";
  let classesQuery = db.collection("classes").where("archived", "==", false);
  let semestersQuery = db.collection("semesters").where("archived", "==", false);
  let archivedClassesQuery = db.collection("classes").where("archived", "==", true);
  let archivedSemestersQuery = db.collection("semesters").where("archived", "==", true);
  if (!isAdmin && state.teacherProfile?.uid) {
    classesQuery = classesQuery.where("teacherUid", "==", state.teacherProfile.uid);
    semestersQuery = semestersQuery.where("teacherUid", "==", state.teacherProfile.uid);
    archivedClassesQuery = archivedClassesQuery.where("teacherUid", "==", state.teacherProfile.uid);
    archivedSemestersQuery = archivedSemestersQuery.where("teacherUid", "==", state.teacherProfile.uid);
  }

  const [classesSnap, semestersSnap, archivedClassesSnap, archivedSemestersSnap] = await Promise.all([
    classesQuery.get(),
    semestersQuery.get(),
    archivedClassesQuery.get(),
    archivedSemestersQuery.get()
  ]);

  state.classList = classesSnap.docs.map((doc) => ({ key: doc.id, ...doc.data() }));
  state.semesterList = semestersSnap.docs.map((doc) => ({ key: doc.id, ...doc.data() }));
  state.archivedClassList = archivedClassesSnap.docs.map((doc) => ({ key: doc.id, ...doc.data() }));
  state.archivedSemesterList = archivedSemestersSnap.docs.map((doc) => ({ key: doc.id, ...doc.data() }));

  setOptions(classSelectTeacher, state.classList, "name");
  setOptions(classSelectStudent, state.classList, "name");
  setOptions(semesterSelectTeacher, state.semesterList, "name");
  setOptions(semesterSelectStudent, state.semesterList, "name");

  renderClassList();
  renderSemesterList();
  renderArchivedClassList();
  renderArchivedSemesterList();
}

async function addClass() {
  const name = qs("#class-name").value.trim();
  if (!name) return;
  const key = makeKeyWithTeacher(name);
  await db.collection("classes").doc(key).set({
    name,
    archived: false,
    teacherUid: state.teacherProfile?.uid || "",
    createdAt: serverTimestamp()
  });
  qs("#class-name").value = "";
  loadClassSemesterOptions();
}

async function addSemester() {
  const name = qs("#semester-name").value.trim();
  if (!name) return;
  const key = makeKeyWithTeacher(name);
  await db.collection("semesters").doc(key).set({
    name,
    archived: false,
    teacherUid: state.teacherProfile?.uid || "",
    createdAt: serverTimestamp()
  });
  qs("#semester-name").value = "";
  loadClassSemesterOptions();
}

function renderClassList() {
  const container = qs("#class-list");
  container.innerHTML = "";
  state.classList.forEach((cls) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${safeText(cls.name)}</span>
      <div class="list-actions">
        <button class="btn btn-secondary" data-action="archive" data-key="${cls.key}">Archive</button>
        <button class="btn btn-danger" data-action="delete" data-key="${cls.key}">Delete</button>
      </div>
    `;
    row.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => handleClassAction(btn.dataset.action, btn.dataset.key));
    });
    container.appendChild(row);
  });
}

function renderSemesterList() {
  const container = qs("#semester-list");
  container.innerHTML = "";
  state.semesterList.forEach((sem) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${safeText(sem.name)}</span>
      <div class="list-actions">
        <button class="btn btn-secondary" data-action="archive" data-key="${sem.key}">Archive</button>
        <button class="btn btn-danger" data-action="delete" data-key="${sem.key}">Delete</button>
      </div>
    `;
    row.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => handleSemesterAction(btn.dataset.action, btn.dataset.key));
    });
    container.appendChild(row);
  });
}

async function handleClassAction(action, key) {
  if (action === "archive") {
    await db.collection("classes").doc(key).update({ archived: true });
  }
  if (action === "delete") {
    await db.collection("classes").doc(key).delete();
  }
  if (action === "restore") {
    await db.collection("classes").doc(key).update({ archived: false });
  }
  loadClassSemesterOptions();
}

async function handleSemesterAction(action, key) {
  if (action === "archive") {
    await db.collection("semesters").doc(key).update({ archived: true });
  }
  if (action === "delete") {
    await db.collection("semesters").doc(key).delete();
  }
  if (action === "restore") {
    await db.collection("semesters").doc(key).update({ archived: false });
  }
  loadClassSemesterOptions();
}

function renderArchivedClassList() {
  const container = qs("#class-archived-list");
  container.innerHTML = "";
  if (!state.archivedClassList.length) {
    container.textContent = "No archived classes.";
    return;
  }
  state.archivedClassList.forEach((cls) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${safeText(cls.name)}</span>
      <div class="list-actions">
        <button class="btn btn-secondary" data-action="restore" data-key="${cls.key}">Restore</button>
        <button class="btn btn-danger" data-action="delete" data-key="${cls.key}">Delete</button>
      </div>
    `;
    row.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => handleClassAction(btn.dataset.action, btn.dataset.key));
    });
    container.appendChild(row);
  });
}

function renderArchivedSemesterList() {
  const container = qs("#semester-archived-list");
  container.innerHTML = "";
  if (!state.archivedSemesterList.length) {
    container.textContent = "No archived semesters.";
    return;
  }
  state.archivedSemesterList.forEach((sem) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${safeText(sem.name)}</span>
      <div class="list-actions">
        <button class="btn btn-secondary" data-action="restore" data-key="${sem.key}">Restore</button>
        <button class="btn btn-danger" data-action="delete" data-key="${sem.key}">Delete</button>
      </div>
    `;
    row.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => handleSemesterAction(btn.dataset.action, btn.dataset.key));
    });
    container.appendChild(row);
  });
}

function makeKeyWithTeacher(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const teacherUid = state.teacherProfile?.uid || "teacher";
  return `${teacherUid}_${base}`;
}
