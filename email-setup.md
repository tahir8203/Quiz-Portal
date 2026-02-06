# Email Notifications Setup

This project writes email jobs to the Firestore `mail` collection when an admin approves or denies a teacher.
To actually send emails, install the Firebase Extension **Trigger Email**:

1. Open Firebase Console ? Extensions ? Trigger Email.
2. Install and configure your SMTP provider (Gmail, SendGrid, etc.).
3. Set the collection name to `mail`.
4. Deploy the extension.

Once installed, any document written to `mail` will send an email.

Example document:
```
{
  to: "teacher@university.edu",
  message: {
    subject: "Teacher Account Approved",
    text: "Your teacher account has been approved."
  }
}
```
