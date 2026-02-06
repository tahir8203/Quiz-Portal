import { db } from "./firebase.js";
import { state } from "./state.js";
import { qs, safeText } from "./utils.js";

export function showAdminTabIfAllowed() {
  const adminTab = qs("#admin-tab-btn");
  if (state.teacherProfile?.role === "admin") {
    adminTab.classList.remove("hidden");
  } else {
    adminTab.classList.add("hidden");
  }
}

export async function loadPendingTeachers() {
  const container = qs("#pending-teachers");
  container.innerHTML = "";
  if (state.teacherProfile?.role !== "admin") {
    container.textContent = "Admin access required.";
    return;
  }

  const snap = await db.collection("teachers").where("active", "==", false).get();
  if (snap.empty) {
    container.textContent = "No pending teachers.";
    return;
  }

  snap.forEach((doc) => {
    const data = doc.data();
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <span>${safeText(data.email)}</span>
      <div class="list-actions">
        <button class="btn btn-success" data-action="approve">Approve</button>
        <button class="btn btn-danger" data-action="deny">Deny</button>
      </div>
    `;
    row.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => handleTeacherAction(doc.id, btn.dataset.action));
    });
    container.appendChild(row);
  });
}

async function handleTeacherAction(uid, action) {
  const teacherDoc = await db.collection("teachers").doc(uid).get();
  const email = teacherDoc.exists ? teacherDoc.data().email : "";
  if (action === "approve") {
    await db.collection("teachers").doc(uid).update({ active: true, approvedAt: new Date() });
    await sendEmail(email, "Teacher Account Approved", "Your teacher account has been approved. You can now sign in.");
  }
  if (action === "deny") {
    await db.collection("teachers").doc(uid).delete();
    await sendEmail(email, "Teacher Account Denied", "Your teacher account was not approved. Contact admin for details.");
  }
  loadPendingTeachers();
}

async function sendEmail(to, subject, text) {
  if (!to) return;
  await db.collection("mail").add({
    to,
    message: {
      subject,
      text
    }
  });
}
