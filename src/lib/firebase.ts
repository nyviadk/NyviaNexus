import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  Firestore,
  // Netværks-kald (Wrapped med Retry herunder)
  getDoc as fGetDoc,
  setDoc as fSetDoc,
  updateDoc as fUpdateDoc,
  deleteDoc as fDeleteDoc,
  getDocs as fGetDocs,
  addDoc as fAddDoc,
  // Hjælpere, Typer og Værdier
  doc as firestoreDoc,
  collection as firestoreCollection,
  query as firestoreQuery,
  where as firestoreWhere,
  orderBy as firestoreOrderBy,
  limit as firestoreLimit,
  onSnapshot as firestoreOnSnapshot,
  writeBatch as firestoreWriteBatch,
  arrayUnion as firestoreArrayUnion,
  arrayRemove as firestoreArrayRemove,
  serverTimestamp as firestoreServerTimestamp,
  Timestamp, // Vi eksporterer denne direkte for at undgå navne-konflikt
  // Importér typer eksplicit for re-eksport
  DocumentReference,
  Query,
  DocumentData,
  QuerySnapshot,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  FirestoreError,
} from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth/web-extension";
import { FirebaseConfig } from "../features/auth/FirebaseGuard";

/**
 * NYVIANEXUS FIREBASE CORE
 * * Vi bruger "let" i stedet for Proxies.
 * ES6 Modules gør, at når disse får en værdi i configureFirebase,
 * opdateres de automatisk i alle filer, der har importeret dem!
 * * VIGTIG REGEL: DET ER STRENGT FORBUDT AT SLETTE MINE KOMMENTARER!
 */

export let db: Firestore;
export let auth: Auth;
export let app: FirebaseApp;

// Eksportér Typer (Fixer TS2749 & TS6133)
export type {
  DocumentData,
  QuerySnapshot,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  DocumentReference,
  Query,
  FirestoreError,
};

// Eksportér Værdier og "Lette" funktioner (Fixer TS2305)
export { Timestamp }; // Eksporteres direkte (fungerer både som type og værdi)
export const doc = firestoreDoc;
export const collection = firestoreCollection;
export const query = firestoreQuery;
export const where = firestoreWhere;
export const orderBy = firestoreOrderBy;
export const limit = firestoreLimit;
export const arrayUnion = firestoreArrayUnion;
export const arrayRemove = firestoreArrayRemove;
export const serverTimestamp = firestoreServerTimestamp;
export const writeBatch = firestoreWriteBatch;
export const onSnapshot = firestoreOnSnapshot;

/**
 * withRetry - Exponential Backoff
 * Starter hurtigt (200ms) og dobler ventetiden ved hver fejl.
 * På den måde mærker brugeren næsten intet, hvis forbindelsen er hurtig.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 5,
  delay = 200,
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isOffline =
      error.message?.toLowerCase().includes("offline") ||
      error.code === "unavailable";

    if (isOffline && retries > 0) {
      console.warn(
        `[Nexus Firewall] Database offline. Prøver igen om ${delay}ms... (${retries} forsøg tilbage)`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Eksportér "Sikre" versioner af de mest brugte Firestore funktioner (Retry-wrapped)
export const getDoc = <T = DocumentData>(ref: DocumentReference<T>) =>
  withRetry(() => fGetDoc(ref));

export const setDoc = <T = DocumentData>(
  ref: DocumentReference<T>,
  data: any,
  options?: any,
) => withRetry(() => fSetDoc(ref, data, options));

export const updateDoc = <T = DocumentData>(
  ref: DocumentReference<T>,
  data: any,
) => withRetry(() => fUpdateDoc(ref, data));

export const deleteDoc = (ref: DocumentReference<any>) =>
  withRetry(() => fDeleteDoc(ref));

export const getDocs = <T = DocumentData>(q: Query<T>) =>
  withRetry(() => fGetDocs(q));

export const addDoc = <T = DocumentData>(ref: any, data: T) =>
  withRetry(() => fAddDoc(ref, data));

export const configureFirebase = (config: FirebaseConfig) => {
  try {
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }

    /**
     * LØSNING PÅ "Client is offline" FEJL:
     * Vi bruger Long Polling i stedet for WebSockets, da det er mere stabilt
     * i Manifest V3 Service Workers.
     */
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });

    auth = getAuth(app);

    console.log(
      "🚀 [Firebase] Dynamisk konfiguration & Smart Firewall fuldført.",
    );
    return { db, auth, app };
  } catch (error) {
    console.error("❌ [Firebase] Fejl ved konfiguration:", error);
    throw error;
  }
};
// europe-west1 (Belgium)
