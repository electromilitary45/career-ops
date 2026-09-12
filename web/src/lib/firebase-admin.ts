import admin from "firebase-admin";

function getAdmin() {
  if (admin.apps.length) return admin;

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    const serviceAccount = JSON.parse(saJson);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return admin;
  }

  throw new Error("FIREBASE_SERVICE_ACCOUNT env var required for server-side operations");
}

export function getAdminDb() {
  return getAdmin().firestore();
}
