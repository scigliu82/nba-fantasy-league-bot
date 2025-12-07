// ═══════════════════════════════════════════════════════
// BACKUP SERVICE - Backup and restore system
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');

// ───────────────────────────────────────────────────────
// CREATE BACKUP
// ───────────────────────────────────────────────────────

async function createBackup(season, type, userId) {
  console.log(`💾 Creating backup for ${season} (type: ${type})...`);
  
  const db = admin.firestore();
  
  try {
    // Generate backup ID with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupId = `backup_${season}_${timestamp}`;
    
    // Fetch current data
    const scheduleDoc = await db.collection('schedules').doc(season).get();
    const standingsDoc = await db.collection('standings').doc(season).get();
    
    if (!scheduleDoc.exists) {
      throw new Error(`Schedule not found for season ${season}`);
    }
    
    const backupData = {
      backup_id: backupId,
      season: season,
      type: type,
      created_by: userId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      
      // Complete snapshots
      schedule: scheduleDoc.data(),
      standings: standingsDoc.exists ? standingsDoc.data() : null,
      
      // Metadata
      games_count: scheduleDoc.data().games.length,
      games_played: scheduleDoc.data().games.filter(g => g.played).length
    };
    
    // Save backup
    await db.collection('backups').doc(backupId).set(backupData);
    
    console.log(`✅ Backup created: ${backupId}`);
    
    return {
      success: true,
      backupId: backupId,
      gamesBackedUp: backupData.games_count
    };
    
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// RESTORE BACKUP
// ───────────────────────────────────────────────────────

async function restoreBackup(backupId) {
  console.log(`🔄 Restoring backup: ${backupId}...`);
  
  const db = admin.firestore();
  
  try {
    // Fetch backup
    const backupDoc = await db.collection('backups').doc(backupId).get();
    
    if (!backupDoc.exists) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    
    const backup = backupDoc.data();
    const season = backup.season;
    
    // Restore schedule
    if (backup.schedule) {
      await db.collection('schedules').doc(season).set({
        ...backup.schedule,
        restored_at: admin.firestore.FieldValue.serverTimestamp(),
        restored_from: backupId
      });
      console.log('  ✅ Schedule restored');
    }
    
    // Restore standings
    if (backup.standings) {
      await db.collection('standings').doc(season).set({
        ...backup.standings,
        restored_at: admin.firestore.FieldValue.serverTimestamp(),
        restored_from: backupId
      });
      console.log('  ✅ Standings restored');
    }
    
    console.log(`✅ Backup restored successfully`);
    
    return {
      success: true,
      season: season,
      gamesRestored: backup.games_count,
      gamesPlayed: backup.games_played
    };
    
  } catch (error) {
    console.error('Error restoring backup:', error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// LIST BACKUPS
// ───────────────────────────────────────────────────────

async function listBackups(season = null, limit = 10) {
  const db = admin.firestore();
  
  try {
    let query = db.collection('backups')
      .orderBy('created_at', 'desc')
      .limit(limit);
    
    if (season) {
      query = query.where('season', '==', season);
    }
    
    const snapshot = await query.get();
    
    const backups = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      backups.push({
        backup_id: data.backup_id,
        season: data.season,
        type: data.type,
        created_at: data.created_at,
        games_count: data.games_count,
        games_played: data.games_played
      });
    });
    
    return backups;
    
  } catch (error) {
    console.error('Error listing backups:', error);
    return [];
  }
}

// ───────────────────────────────────────────────────────
// DELETE OLD BACKUPS
// ───────────────────────────────────────────────────────

async function deleteOldBackups(daysToKeep = 30) {
  console.log(`🗑️ Deleting backups older than ${daysToKeep} days...`);
  
  const db = admin.firestore();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const snapshot = await db.collection('backups')
      .where('created_at', '<', cutoffDate)
      .get();
    
    const batch = db.batch();
    let count = 0;
    
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
      count++;
    });
    
    if (count > 0) {
      await batch.commit();
      console.log(`✅ Deleted ${count} old backups`);
    } else {
      console.log('No old backups to delete');
    }
    
    return count;
    
  } catch (error) {
    console.error('Error deleting old backups:', error);
    return 0;
  }
}

// ───────────────────────────────────────────────────────
// EXPORTS
// ───────────────────────────────────────────────────────

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  deleteOldBackups
};