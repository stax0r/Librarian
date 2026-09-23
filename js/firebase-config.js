import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDqlHRgxjGhPUZ0XZYWyNDX1zy-EpxVRs4",
    authDomain: "library-def46.firebaseapp.com",
    databaseURL: "https://library-def46-default-rtdb.firebaseio.com",
    projectId: "library-def46",
    storageBucket: "library-def46.firebasestorage.app",
    messagingSenderId: "411144048465",
    appId: "1:411144048465:web:6a481d5d7eb3113f0d8d70",
    measurementId: "G-JSGJ6GSRVJ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);