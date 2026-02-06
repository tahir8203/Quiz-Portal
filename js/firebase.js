export const firebaseConfig = {
  apiKey: "AIzaSyD7bzc9CPZzAl9OGHrT5jnO2eljJaDh7zE",
  authDomain: "pgcquiz.firebaseapp.com",
  projectId: "pgcquiz",
  storageBucket: "pgcquiz.appspot.com",
  messagingSenderId: "421283264016",
  appId: "1:421283264016:web:82c44b4ae0d22fb2443c95"
};

firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();

export const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
