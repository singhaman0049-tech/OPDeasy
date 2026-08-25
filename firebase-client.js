import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    confirmPasswordReset,
    verifyPasswordResetCode,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

import {
    getDatabase,
    ref,
    set,
    get,
    update,
    onValue
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";


const firebaseConfig = {
    apiKey: "AIzaSyDsyAcahXHAI14JcbLX6eyV7KAyWtx1Lno",
    authDomain: "opdeasy-57f8a.firebaseapp.com",
    projectId: "opdeasy-57f8a",
    databaseURL: "https://opdeasy-57f8a-default-rtdb.firebaseio.com/",
    storageBucket: "opdeasy-57f8a.firebasestorage.app",
    messagingSenderId: "817688179546",
    appId: "1:817688179546:web:0c67aa31606db95a983963",
    measurementId: "G-RCYDBC9JGD"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getDatabase(app);


window.firebase = {
    app,
    auth,
    db,

    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    confirmPasswordReset,
    verifyPasswordResetCode,
    onAuthStateChanged,

    ref,
    set,
    get,
    update,
    onValue
};

console.log("Firebase Authentication + Realtime Database initialized");
