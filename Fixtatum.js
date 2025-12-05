// RECOVERY SCRIPT - Fix Lost Player (Tatum)
// Run with: node fix-tatum.js

const admin = require('firebase-admin');

// Initialize Firebase
const serviceAccount = require('./config/firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixLostPlayer() {
  console.log('🔧 FIXING LOST PLAYER - Tatum\n');
  
  try {
    // 1. Find Tatum (player con current_team = 'traded')
    console.log('🔍 Searching for lost players...');
    const playersSnapshot = await db.collection('players')
      .where('current_team', '==', 'traded')
      .get();
    
    if (playersSnapshot.empty) {
      console.log('✅ No lost players found! (current_team = "traded")');
      return;
    }
    
    console.log(`Found ${playersSnapshot.size} lost players:\n`);
    
    const lostPlayers = [];
    playersSnapshot.forEach(doc => {
      const player = doc.data();
      console.log(`❌ ${player.name} (${doc.id})`);
      console.log(`   Overall: ${player.overall}`);
      console.log(`   Salary: $${(player.salary / 1000000).toFixed(1)}M`);
      console.log(`   Current Team: ${player.current_team}`);
      console.log('');
      
      lostPlayers.push({
        id: doc.id,
        name: player.name,
        overall: player.overall,
        salary: player.salary
      });
    });
    
    // 2. Check last trade to determine correct team
    console.log('📋 Checking last trade (trade_9)...');
    const tradeDoc = await db.collection('trades').doc('trade_9').get();
    
    if (!tradeDoc.exists) {
      console.log('❌ Trade trade_9 not found!');
      return;
    }
    
    const trade = tradeDoc.data();
    console.log(`\nTrade #${trade.number}: ${trade.teams.join(' ⇄ ')}`);
    console.log(`Status: ${trade.status}\n`);
    
    // Show trade details
    for (const teamId of trade.teams) {
      const sends = trade[`${teamId}_sends`];
      const receives = trade[`${teamId}_receives`];
      
      console.log(`${teamId.toUpperCase()}:`);
      console.log(`  Sends: ${sends.players.map(p => p.name).join(', ')}`);
      console.log(`  Receives: ${receives.players.map(p => p.name).join(', ')}`);
      console.log('');
    }
    
    // 3. Fix each lost player
    console.log('🔧 Fixing lost players...\n');
    
    for (const lostPlayer of lostPlayers) {
      // Find which team should have this player
      let correctTeam = null;
      
      for (const teamId of trade.teams) {
        const sends = trade[`${teamId}_sends`];
        const receives = trade[`${teamId}_receives`];
        
        // Check if this player was sent by this team
        const wasSent = sends.players.some(p => p.name === lostPlayer.name);
        
        if (wasSent) {
          // Player was sent BY this team, so should go to OTHER team
          correctTeam = trade.teams.find(t => t !== teamId);
          break;
        }
      }
      
      if (correctTeam) {
        console.log(`✅ ${lostPlayer.name} should be in: ${correctTeam.toUpperCase()}`);
        
        // Update player
        await db.collection('players').doc(lostPlayer.id).update({
          current_team: correctTeam,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`   ✅ Updated ${lostPlayer.name} → ${correctTeam}`);
      } else {
        console.log(`❌ Could not determine correct team for ${lostPlayer.name}`);
      }
      
      console.log('');
    }
    
    console.log('✅ Recovery complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

fixLostPlayer();