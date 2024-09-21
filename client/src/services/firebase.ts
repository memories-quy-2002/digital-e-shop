// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCae88IRpKYJbHLxZIiArzIPYTkglQqgb0",
    authDomain: "graduation-project-5bbfb.firebaseapp.com",
    projectId: "graduation-project-5bbfb",
    storageBucket: "graduation-project-5bbfb.appspot.com",
    messagingSenderId: "503526214575",
    appId: "1:503526214575:web:5c4e1263f106bc2bee7d5a",
    measurementId: "G-NGN3CY83D3",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
