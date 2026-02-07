import { db, storage, serverTimestamp } from "./firebase.js";
import { state } from "./state.js";
import { qs, setOptions, formatAssignmentLabel, safeText } from "./utils.js";

const assignmentSelectTeacher = qs("#assignment-number");
const assignmentSelectStudent = qs("#student-assignment-number");

export function initAssignmentSelectors() {
  const options = Array.from({ length: 6 }, (_, i) => ({ key: String(i + 1), name: formatAssignmentLabel(i + 1) }));
  setOptions(assignmentSelectTeacher, options, "name");
  setOptions(assignmentSelectStudent, options, "name");
}

export function bindAssignmentHandlers() {
  qs("#btn-save-assignment").addEventListener("click", saveAssignment);
  qs("#btn-delete-assignment").addEventListener("click", deleteAssignment);
  qs("#btn-archive-assignment").addEventListener("click", archiveAssignment);
  qs("#btn-restore-assignment").addEventListener("click", restoreAssignment);
  assignmentSelectTeacher.addEventListener("change", loadAssignment);
  assignmentSelectStudent.addEventListener("change", loadStudentAssignment);
  qs("#btn-upload-assignment").addEventListener("click", uploadSubmission);
}

async function saveAssignment() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const assignmentNumber = assignmentSelectTeacher.value;
  const title = qs("#assignment-title").value.trim();
  const dueDate = qs("#assignment-due").value;
  const notes = qs("#assignment-notes").value.trim();

  if (!classKey || !semesterKey || !assignmentNumber || !title) {
    alert("Complete all required fields");
    return;
  }

  const teacherUid = state.teacherProfile?.uid || "";
  const docKey = makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber);
  await db.collection("assignments").doc(docKey).set({
    teacherUid,
    classKey,
    semesterKey,
    assignmentNumber: Number(assignmentNumber),
    title,
    dueDate: dueDate || null,
    notes,
    archived: false,
    archivedAt: null,
    restoredAt: null,
    createdAt: serverTimestamp()
  }, { merge: true });

  await loadAssignment();
  loadArchivedAssignments();
  alert("Assignment saved");
}

async function loadAssignment() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const assignmentNumber = assignmentSelectTeacher.value;
  if (!classKey || !semesterKey || !assignmentNumber) return;

  const teacherUid = state.teacherProfile?.uid || "";
  const docKey = makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber);
  const doc = await db.collection("assignments").doc(docKey).get();
  if (!doc.exists) {
    qs("#assignment-title").value = "";
    qs("#assignment-due").value = "";
    qs("#assignment-notes").value = "";
    qs("#submission-list").innerHTML = "No submissions yet.";
    return;
  }

  const data = doc.data();
  if (data.archived) {
    qs("#submission-list").innerHTML = "Assignment archived.";
    return;
  }
  qs("#assignment-title").value = data.title || "";
  qs("#assignment-due").value = data.dueDate || "";
  qs("#assignment-notes").value = data.notes || "";
  await loadSubmissions(teacherUid, classKey, semesterKey, assignmentNumber);
  loadArchivedAssignments();
}

async function loadSubmissions(teacherUid, classKey, semesterKey, assignmentNumber) {
  const list = qs("#submission-list");
  list.innerHTML = "Loading...";
  const snap = await db.collection("submissions")
    .where("teacherUid", "==", teacherUid)
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .where("assignmentNumber", "==", Number(assignmentNumber))
    .get();

  list.innerHTML = "";
  if (snap.empty) {
    list.textContent = "No submissions.";
    return;
  }

  snap.forEach((doc) => {
    const data = doc.data();
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${safeText(data.roll)} - ${safeText(data.name)}</span>
      <a class="btn btn-secondary" href="${data.downloadUrl}" target="_blank">Download</a>
    `;
    list.appendChild(row);
  });
}

async function deleteAssignment() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const assignmentNumber = assignmentSelectTeacher.value;
  if (!classKey || !semesterKey || !assignmentNumber) return;

  const teacherUid = state.teacherProfile?.uid || "";
  const docKey = makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber);
  const submissionsSnap = await db.collection("submissions")
    .where("teacherUid", "==", teacherUid)
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .where("assignmentNumber", "==", Number(assignmentNumber))
    .get();

  const deletePromises = submissionsSnap.docs.map(async (doc) => {
    const data = doc.data();
    if (data.storagePath) {
      await storage.ref(data.storagePath).delete();
    }
    return doc.ref.delete();
  });

  await Promise.all(deletePromises);
  await db.collection("assignments").doc(docKey).delete();

  qs("#assignment-title").value = "";
  qs("#assignment-due").value = "";
  qs("#assignment-notes").value = "";
  qs("#submission-list").innerHTML = "Assignment deleted.";
}

async function loadStudentAssignment() {
  if (!state.studentProfile) return;
  const classKey = state.studentProfile.classKey;
  const semesterKey = state.studentProfile.semesterKey;
  const assignmentNumber = assignmentSelectStudent.value;
  const details = qs("#assignment-details");
  details.innerHTML = "";
  if (!assignmentNumber) return;

  const teacherUid = state.studentProfile.teacherUid || "";
  const docKey = makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber);
  const doc = await db.collection("assignments").doc(docKey).get();
  if (!doc.exists) {
    details.textContent = "No assignment published.";
    return;
  }

  const data = doc.data();
  if (data.archived) {
    details.textContent = "Assignment archived.";
    return;
  }
  const row = document.createElement("div");
  row.className = "list-item";
  row.innerHTML = `
    <div>
      <div><strong>${safeText(data.title)}</strong></div>
      <div>Due: ${safeText(data.dueDate || "Not set")}</div>
      <div>${safeText(data.notes)}</div>
    </div>
  `;
  details.appendChild(row);

  const submissionKey = `${teacherUid}_${classKey}_${semesterKey}_assignment_${assignmentNumber}_roll_${state.studentProfile.roll}`;
  const submissionDoc = await db.collection("submissions").doc(submissionKey).get();
  if (submissionDoc.exists) {
    const submission = submissionDoc.data();
    const statusRow = document.createElement("div");
    statusRow.className = "list-item";
    statusRow.innerHTML = `
      <div>
        <strong>Submitted</strong>
        <div>${safeText(submission.submittedAt?.toDate ? submission.submittedAt.toDate().toLocaleString() : "")}</div>
      </div>
    `;
    details.appendChild(statusRow);
  }
}

async function archiveAssignment() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const assignmentNumber = assignmentSelectTeacher.value;
  if (!classKey || !semesterKey || !assignmentNumber) return;
  const teacherUid = state.teacherProfile?.uid || "";
  const docKey = makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber);
  await db.collection("assignments").doc(docKey).set({ archived: true, archivedAt: serverTimestamp() }, { merge: true });
  loadArchivedAssignments();
}

async function restoreAssignment() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const assignmentNumber = assignmentSelectTeacher.value;
  if (!classKey || !semesterKey || !assignmentNumber) return;
  const teacherUid = state.teacherProfile?.uid || "";
  const docKey = makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber);
  await db.collection("assignments").doc(docKey).set({ archived: false, restoredAt: serverTimestamp() }, { merge: true });
  loadArchivedAssignments();
}

export async function loadArchivedAssignments() {
  const classKey = state.currentClassKey;
  const semesterKey = state.currentSemesterKey;
  const list = qs("#archived-assignments");
  list.innerHTML = "";
  if (!classKey || !semesterKey) {
    list.textContent = "Select class and semester.";
    return;
  }
  const teacherUid = state.teacherProfile?.uid || "";
  const snap = await db.collection("assignments")
    .where("teacherUid", "==", teacherUid)
    .where("classKey", "==", classKey)
    .where("semesterKey", "==", semesterKey)
    .where("archived", "==", true)
    .get();
  if (snap.empty) {
    list.textContent = "No archived assignments.";
    return;
  }
  snap.forEach((doc) => {
    const data = doc.data();
    const row = document.createElement("div");
    row.className = "list-item";
    const archivedAt = data.archivedAt?.toDate ? data.archivedAt.toDate().toLocaleString() : "N/A";
    row.innerHTML = `
      <span>${formatAssignmentLabel(data.assignmentNumber)} (Archived: ${archivedAt})</span>
      <button class="btn btn-secondary" data-restore="${doc.id}">Restore</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      await db.collection("assignments").doc(doc.id).set({ archived: false }, { merge: true });
      loadArchivedAssignments();
    });
    list.appendChild(row);
  });
}

async function uploadSubmission() {
  if (!state.studentProfile) return;
  const fileInput = qs("#assignment-file");
  const status = qs("#assignment-upload-status");
  const assignmentNumber = assignmentSelectStudent.value;
  if (!assignmentNumber) {
    alert("Select assignment number");
    return;
  }
  if (!fileInput.files.length) {
    alert("Choose a file");
    return;
  }

  const classKey = state.studentProfile.classKey;
  const semesterKey = state.studentProfile.semesterKey;
  const teacherUid = state.studentProfile.teacherUid || "";
  const docKey = makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber);
  const assignmentDoc = await db.collection("assignments").doc(docKey).get();
  if (!assignmentDoc.exists) {
    alert("Assignment not found");
    return;
  }
  const assignmentData = assignmentDoc.data();
  if (assignmentData.dueDate) {
    const dueDate = new Date(assignmentData.dueDate + "T23:59:59");
    if (new Date() > dueDate) {
      alert("Submission deadline has passed");
      return;
    }
  }

  const file = fileInput.files[0];
  if (file.size > 10 * 1024 * 1024) {
    alert("File size must be 10 MB or less");
    return;
  }

  const storagePath = `submissions/${teacherUid}/${classKey}/${semesterKey}/assignment-${assignmentNumber}/${state.studentProfile.roll}-${Date.now()}-${file.name}`;
  status.textContent = "Uploading...";

  const submissionKey = `${teacherUid}_${classKey}_${semesterKey}_assignment_${assignmentNumber}_roll_${state.studentProfile.roll}`;
  const existingSubmission = await db.collection("submissions").doc(submissionKey).get();
  if (existingSubmission.exists && existingSubmission.data().storagePath) {
    try {
      await storage.ref(existingSubmission.data().storagePath).delete();
    } catch (err) {
      // Ignore missing file errors.
    }
  }

  const ref = storage.ref(storagePath);
  await ref.put(file);
  const downloadUrl = await ref.getDownloadURL();

  await db.collection("submissions").doc(submissionKey).set({
    teacherUid,
    classKey,
    semesterKey,
    assignmentNumber: Number(assignmentNumber),
    studentUid: state.user.uid,
    roll: state.studentProfile.roll,
    name: state.studentProfile.name,
    storagePath,
    downloadUrl,
    submittedAt: serverTimestamp()
  }, { merge: true });

  status.textContent = "Uploaded";
  fileInput.value = "";
}

function makeAssignmentKey(teacherUid, classKey, semesterKey, assignmentNumber) {
  return `${teacherUid}_${classKey}_${semesterKey}_assignment_${assignmentNumber}`;
}
