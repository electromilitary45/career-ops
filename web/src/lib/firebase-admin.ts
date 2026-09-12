import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdmin() {
  if (getApps().length) return getApps()[0];

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    const serviceAccount = JSON.parse(saJson);
    return initializeApp({ credential: cert(serviceAccount) });
  }

  throw new Error("FIREBASE_SERVICE_ACCOUNT env var required for server-side operations");
}

export function getAdminDb() {
  return getFirestore(getAdmin());
}
