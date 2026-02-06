import { db } from "./firebase.js";
import { state } from "./state.js";
import { qs, setOptions, safeText } from "./utils.js";

export async function loadStudentEnrollmentOptions() {
  const classKey = qs("#student-class").value;
  const semesterKey = qs("#student-semester").value;
  const nameSelect = qs("#student-name-select");
  const rollSelect = qs("#student-roll-select");

  nameSelect.innerHTML = "";
  rollSelect.innerHTML = "";

  if (!classKey || !semesterKey) return;

  const snap = await db.collection("enrollments")
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .get();

  if (snap.empty) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No enrolled students";
    nameSelect.appendChild(opt);
    const opt2 = document.createElement("option");
    opt2.value = "";
    opt2.textContent = "No enrolled students";
    rollSelect.appendChild(opt2);
    return;
  }

  const students = snap.docs.map((doc) => doc.data());
  const nameOptions = [{ key: "", name: "Select" }].concat(
    students.map((s) => ({ key: s.name, name: s.name, roll: s.roll }))
  );
  const rollOptions = [{ key: "", name: "Select" }].concat(
    students.map((s) => ({ key: s.roll, name: s.roll, studentName: s.name }))
  );

  setOptions(nameSelect, nameOptions, "name");
  setOptions(rollSelect, rollOptions, "name");

  nameSelect.addEventListener("change", () => {
    const selected = students.find((s) => s.name === nameSelect.value);
    if (selected) rollSelect.value = selected.roll;
  });

  rollSelect.addEventListener("change", () => {
    const selected = students.find((s) => s.roll === rollSelect.value);
    if (selected) nameSelect.value = selected.name;
  });
}
