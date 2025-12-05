/**
 * Script per aggiungere il campo 'conference' a tutti i team
 * ESEGUI QUESTO SCRIPT PRIMA DI USARE LA NUOVA VERSIONE
 * 
 * Uso: node add-conferences.js
 */

const admin = require('firebase-admin');

// Se Firebase non è già inizializzato
if (!admin.apps.length) {
  const serviceAccount = require('./config/firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// NBA Teams divisi per conference
const easternTeams = [
  'hawks',       // Atlanta Hawks
  'celtics',     // Boston Celtics
  'nets',        // Brooklyn Nets
  'hornets',     // Charlotte Hornets
  'bulls',       // Chicago Bulls
  'cavaliers',   // Cleveland Cavaliers
  'pistons',     // Detroit Pistons
  'pacers',      // Indiana Pacers
  'heat',        // Miami Heat
  'bucks',       // Milwaukee Bucks
  'knicks',      // New York Knicks
  'magic',       // Orlando Magic
  'sixers',      // Philadelphia 76ers
  'raptors',     // Toronto Raptors
  'wizards'      // Washington Wizards
];

const westernTeams = [
  'mavericks',      // Dallas Mavericks
  'nuggets',        // Denver Nuggets
  'warriors',       // Golden State Warriors
  'rockets',        // Houston Rockets
  'clippers',       // Los Angeles Clippers
  'lakers',         // Los Angeles Lakers
  'grizzlies',      // Memphis Grizzlies
  'timberwolves',   // Minnesota Timberwolves
  'pelicans',       // New Orleans Pelicans
  'thunder',        // Oklahoma City Thunder
  'suns',           // Phoenix Suns
  'blazers',        // Portland Trail Blazers
  'kings',          // Sacramento Kings
  'spurs',          // San Antonio Spurs
  'jazz'            // Utah Jazz
];

async function addConferences() {
  console.log('🔄 Adding conference field to all teams...');
  
  try {
    const batch = db.batch();
    let updateCount = 0;
    
    // Update Eastern Conference teams
    for (const teamId of easternTeams) {
      const ref = db.collection('teams').doc(teamId);
      
      // Verifica che il team esista
      const doc = await ref.get();
      if (doc.exists) {
        batch.update(ref, { conference: 'eastern' });
        updateCount++;
        console.log(`✅ ${teamId} → Eastern Conference`);
      } else {
        console.warn(`⚠️  ${teamId} not found in database`);
      }
    }
    
    // Update Western Conference teams
    for (const teamId of westernTeams) {
      const ref = db.collection('teams').doc(teamId);
      
      // Verifica che il team esista
      const doc = await ref.get();
      if (doc.exists) {
        batch.update(ref, { conference: 'western' });
        updateCount++;
        console.log(`✅ ${teamId} → Western Conference`);
      } else {
        console.warn(`⚠️  ${teamId} not found in database`);
      }
    }
    
    // Commit batch
    await batch.commit();
    
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('✅ Conference field added successfully!');
    console.log('═══════════════════════════════════════');
    console.log(`📊 Summary:`);
    console.log(`   Total teams updated: ${updateCount}/30`);
    console.log(`   Eastern Conference: ${easternTeams.length} teams`);
    console.log(`   Western Conference: ${westernTeams.length} teams`);
    console.log('');
    console.log('🎉 You can now use the new trade system!');
    
  } catch (error) {
    console.error('❌ Error adding conferences:', error);
  }
  
  process.exit(0);
}

// Esegui
addConferences();