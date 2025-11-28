// ═══════════════════════════════════════════════════════
// FIREBASE DATABASE CONNECTION
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db = null;

// ───────────────────────────────────────────────────────
// INITIALIZE FIREBASE
// ───────────────────────────────────────────────────────

async function initializeDatabase() {
  try {
    // Check if already initialized
    if (db) {
      console.log('⚠️  Firebase already initialized');
      return db;
    }

    let serviceAccount;

    // Try to load from file first
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
                                path.join(__dirname, '../../config/firebase-service-account.json');

    if (fs.existsSync(serviceAccountPath)) {
      console.log('📄 Loading Firebase credentials from file...');
      serviceAccount = require(serviceAccountPath);
    } else {
      // Load from environment variables
      console.log('🔐 Loading Firebase credentials from environment...');
      serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
      };
    }

    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });

    // Get Firestore instance
    db = admin.firestore();

    // Test connection
    await db.collection('_test').doc('connection').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'connected'
    });

    console.log('✅ Firebase initialized successfully');
    return db;

  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error.message);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// GET DATABASE INSTANCE
// ───────────────────────────────────────────────────────

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

// ───────────────────────────────────────────────────────
// COLLECTION HELPERS
// ───────────────────────────────────────────────────────

const collections = {
  teams: () => getDatabase().collection('teams'),
  players: () => getDatabase().collection('players'),
  trades: () => getDatabase().collection('trades'),
  freeAgency: () => getDatabase().collection('free_agency'),
  waiverWire: () => getDatabase().collection('waiver_wire'),
  schedule: () => getDatabase().collection('schedule'),
  standings: () => getDatabase().collection('standings'),
  draftPicks: () => getDatabase().collection('draft_picks'),
  contracts: () => getDatabase().collection('contracts'),
  seasons: () => getDatabase().collection('seasons'),
  settings: () => getDatabase().collection('settings'),
  logs: () => getDatabase().collection('logs'),
};

// ───────────────────────────────────────────────────────
// COMMON DATABASE OPERATIONS
// ───────────────────────────────────────────────────────

async function getDocument(collectionName, docId) {
  try {
    const doc = await getDatabase().collection(collectionName).doc(docId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error(`Error getting document ${docId} from ${collectionName}:`, error);
    throw error;
  }
}

async function setDocument(collectionName, docId, data) {
  try {
    await getDatabase().collection(collectionName).doc(docId).set(data, { merge: true });
    return { id: docId, ...data };
  } catch (error) {
    console.error(`Error setting document ${docId} in ${collectionName}:`, error);
    throw error;
  }
}

async function updateDocument(collectionName, docId, data) {
  try {
    await getDatabase().collection(collectionName).doc(docId).update(data);
    return { id: docId, ...data };
  } catch (error) {
    console.error(`Error updating document ${docId} in ${collectionName}:`, error);
    throw error;
  }
}

async function deleteDocument(collectionName, docId) {
  try {
    await getDatabase().collection(collectionName).doc(docId).delete();
    return true;
  } catch (error) {
    console.error(`Error deleting document ${docId} from ${collectionName}:`, error);
    throw error;
  }
}

async function queryCollection(collectionName, conditions = []) {
  try {
    let query = getDatabase().collection(collectionName);
    
    // Apply conditions
    for (const condition of conditions) {
      const [field, operator, value] = condition;
      query = query.where(field, operator, value);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return [];
    }
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error(`Error querying collection ${collectionName}:`, error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// BATCH OPERATIONS
// ───────────────────────────────────────────────────────

function createBatch() {
  return getDatabase().batch();
}

async function commitBatch(batch) {
  try {
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Error committing batch:', error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// EXPORTS
// ───────────────────────────────────────────────────────

module.exports = {
  initializeDatabase,
  getDatabase,
  collections,
  
  // CRUD operations
  getDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  queryCollection,
  
  // Batch operations
  createBatch,
  commitBatch,
  
  // Admin SDK (for advanced operations)
  admin,
};