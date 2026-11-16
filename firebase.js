import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAFsbaL8RmmquS9JttF7FATeg9_3KTs5Is",
  authDomain: "husby-ab27a.firebaseapp.com",
  projectId: "husby-ab27a",
  storageBucket: "husby-ab27a.firebasestorage.app",
  messagingSenderId: "893294996457",
  appId: "1:893294996457:web:65a4187f0467ae541a3978",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function getApprovedPriceReports() {
  const reports = await getDocs(query(
    collection(db, "priceReports"),
    where("status", "==", "approved"),
    orderBy("createdAt", "desc"),
    limit(200),
  ));
  return reports.docs.map((report) => ({ id: report.id, ...report.data() }));
}

function savePriceReport(report) {
  return addDoc(collection(db, "priceReports"), {
    ...report,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export {
  auth,
  createUserWithEmailAndPassword,
  getApprovedPriceReports,
  onAuthStateChanged,
  savePriceReport,
  signInWithEmailAndPassword,
  signOut,
};
