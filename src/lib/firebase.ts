import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Indsæt dine egne Firebase-nøgler her fra Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyBAcOVYRONo6_rYm7QkT8yDD_szhfcrZ2w",
  authDomain: "nyvianexus.firebaseapp.com",
  projectId: "nyvianexus",
  storageBucket: "nyvianexus.firebasestorage.app",
  messagingSenderId: "621186701330",
  appId: "1:621186701330:web:41a6423ef21c622b19e0cb",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// europe-west1 (Belgium)
