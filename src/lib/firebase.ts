import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { FirebaseConfig } from "@/components/FirebaseGuard";

// Vi bruger "let" i stedet for Proxies.
// ES6 Modules gør, at når disse får en værdi i configureFirebase,
// opdateres de automatisk i alle filer, der har importeret dem!
export let db: Firestore;
export let auth: Auth;
export let app: FirebaseApp;

export const configureFirebase = (config: FirebaseConfig) => {
  try {
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }

    // Tildel de ægte instanser direkte til de eksporterede variabler
    db = getFirestore(app);
    auth = getAuth(app);

    console.log(
      "🚀 [Firebase] Dynamisk konfiguration fuldført og live-bindings er opdateret.",
    );
  } catch (error) {
    console.error("❌ [Firebase] Fejl ved konfiguration:", error);
  }
};

// europe-west1 (Belgium)
