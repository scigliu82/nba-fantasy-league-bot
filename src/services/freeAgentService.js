// ═══════════════════════════════════════════════════════
// FREE AGENT SERVICE
// Gestione completa del sistema Free Agency
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');

// ───────────────────────────────────────────────────────
// MINIMUM SALARY TABLE (based on experience)
// ───────────────────────────────────────────────────────

const MINIMUM_SALARIES = {
  0: 1100000,   // 0 anni
  1: 1900000,   // 1-2 anni
  2: 1900000,
  3: 2100000,   // 3-4 anni
  4: 2100000,
  5: 2300000,   // 5-6 anni
  6: 2300000,
  7: 2600000,   // 7-9 anni
  8: 2600000,
  9: 2600000,
  10: 3200000   // 10+ anni
};

function getMinimumSalary(experience) {
  if (experience >= 10) return MINIMUM_SALARIES[10];
  return MINIMUM_SALARIES[experience] || MINIMUM_SALARIES[0];
}

// ───────────────────────────────────────────────────────
// ALPHABETICAL GROUPS (max 25 players per group)
// ───────────────────────────────────────────────────────

const ALPHABET_GROUPS = [
  { id: 'group_1', label: 'A-C', start: 'A', end: 'C' },
  { id: 'group_2', label: 'D-I', start: 'D', end: 'I' },
  { id: 'group_3', label: 'J', start: 'J', end: 'J' },
  { id: 'group_4', label: 'K-L', start: 'K', end: 'L' },
  { id: 'group_5', label: 'M-Q', start: 'M', end: 'Q' },
  { id: 'group_6', label: 'R-S', start: 'R', end: 'S' },
  { id: 'group_7', label: 'T-Z', start: 'T', end: 'Z' }
];

function getAlphabetGroup(playerName) {
  const firstLetter = playerName[0].toUpperCase();
  
  for (const group of ALPHABET_GROUPS) {
    if (firstLetter >= group.start && firstLetter <= group.end) {
      return group.id;
    }
  }
  
  return 'group_7'; // Default to last group
}

function getPlayersInGroup(players, groupId) {
  const group = ALPHABET_GROUPS.find(g => g.id === groupId);
  if (!group) return [];
  
  return Object.values(players).filter(player => {
    // Check if player has name
    if (!player || !player.name || typeof player.name !== 'string') {
      console.warn('Player without valid name:', player);
      return false;
    }
    
    const firstLetter = player.name[0].toUpperCase();
    return firstLetter >= group.start && firstLetter <= group.end;
  });
}

// ───────────────────────────────────────────────────────
// DATABASE OPERATIONS
// ───────────────────────────────────────────────────────

/**
 * Import FA market from JSON
 */
async function importFAMarket(season, playersData) {
  const db = admin.firestore();
  
  const faDoc = {
    season: season,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    players: playersData
  };
  
  await db.collection('free_agents').doc(`fa_${season}`).set(faDoc);
  
  console.log(`✅ Imported ${Object.keys(playersData).length} free agents for ${season}`);
  
  return {
    success: true,
    count: Object.keys(playersData).length
  };
}

/**
 * Get all FA for a season
 */
async function getFAMarket(season) {
  const db = admin.firestore();
  
  const docId = `fa_${season}`;
  console.log(`[GET-FA-MARKET] Looking for document: ${docId}`);
  
  const faDoc = await db.collection('free_agents').doc(docId).get();
  
  if (!faDoc.exists) {
    console.log(`[GET-FA-MARKET] Document not found: ${docId}`);
    
    // List available documents
    const snapshot = await db.collection('free_agents').limit(5).get();
    console.log(`[GET-FA-MARKET] Available documents:`, snapshot.docs.map(d => d.id));
    
    return null;
  }
  
  console.log(`[GET-FA-MARKET] Document found: ${docId}`);
  return faDoc.data();
}

/**
 * Get single player
 */
async function getPlayer(season, playerId) {
  console.log(`[GET-PLAYER] Looking for player: ${playerId} in season: ${season}`);
  
  const market = await getFAMarket(season);
  
  if (!market) {
    console.log(`[GET-PLAYER] Market not found for season: ${season}`);
    return null;
  }
  
  if (!market.players[playerId]) {
    console.log(`[GET-PLAYER] Player ${playerId} not found in market`);
    console.log(`[GET-PLAYER] Available players:`, Object.keys(market.players).slice(0, 5));
    return null;
  }
  
  console.log(`[GET-PLAYER] Player found: ${market.players[playerId].name}, status: ${market.players[playerId].status}`);
  
  return market.players[playerId];
}

/**
 * Get available players (status = available)
 */
async function getAvailablePlayers(season, filters = {}) {
  const market = await getFAMarket(season);
  
  if (!market) return [];
  
  let players = Object.values(market.players).filter(p => p.status === 'available');
  
  // Apply filters
  if (filters.role) {
    players = players.filter(p => 
      p.role.toLowerCase().includes(filters.role.toLowerCase())
    );
  }
  
  if (filters.min_overall) {
    players = players.filter(p => p.overall >= filters.min_overall);
  }
  
  if (filters.max_overall) {
    players = players.filter(p => p.overall <= filters.max_overall);
  }
  
  if (filters.max_age) {
    players = players.filter(p => p.age <= filters.max_age);
  }
  
  // Sort
  if (filters.sort_by === 'overall') {
    players.sort((a, b) => b.overall - a.overall);
  } else if (filters.sort_by === 'age') {
    players.sort((a, b) => a.age - b.age);
  } else {
    // Default: alphabetical
    players.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return players;
}

/**
 * Update player status
 */
async function updatePlayerStatus(season, playerId, status, data = {}) {
  const db = admin.firestore();
  
  const updateData = {
    [`players.${playerId}.status`]: status,
    [`players.${playerId}.updated_at`]: admin.firestore.FieldValue.serverTimestamp(),
    'updated_at': admin.firestore.FieldValue.serverTimestamp()
  };
  
  // Add additional data
  Object.keys(data).forEach(key => {
    updateData[`players.${playerId}.${key}`] = data[key];
  });
  
  await db.collection('free_agents').doc(`fa_${season}`).update(updateData);
  
  console.log(`✅ Updated player ${playerId} status to ${status}`);
}

/**
 * Add player to FA market (when cut from team)
 */
async function addPlayerToMarket(season, playerData) {
  const db = admin.firestore();
  
  const playerId = playerData.name.toLowerCase().replace(/\s+/g, '_').replace(/[.']/g, '');
  
  const player = {
    player_id: playerId,
    name: playerData.name,
    role: playerData.position || 'Unknown',
    age: playerData.age || 25,
    overall: playerData.overall || 70,
    experience: playerData.experience || 0,
    loyalty: 50,  // Default
    money_imp: 50,
    win_imp: 50,
    status: 'available',
    current_offers: [],
    signed_team: null,
    signed_at: null,
    waived: true,
    previous_team: playerData.team_id || null,
    waived_date: admin.firestore.FieldValue.serverTimestamp(),
    cut_method: playerData.cut_method || 'normal'
  };
  
  await db.collection('free_agents').doc(`fa_${season}`).update({
    [`players.${playerId}`]: player,
    'updated_at': admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`✅ Added ${playerData.name} to FA market (waived by ${playerData.team_id})`);
  
  return player;
}

/**
 * Remove player from FA market (signed with team)
 */
async function removePlayerFromMarket(season, playerId) {
  const db = admin.firestore();
  
  await db.collection('free_agents').doc(`fa_${season}`).update({
    [`players.${playerId}`]: admin.firestore.FieldValue.delete(),
    'updated_at': admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`✅ Removed player ${playerId} from FA market`);
}

// ───────────────────────────────────────────────────────
// FA OFFER MANAGEMENT
// ───────────────────────────────────────────────────────

/**
 * Create FA offer
 */
async function createOffer(offerData) {
  const db = admin.firestore();
  
  // Generate offer ID
  const offerId = `offer_${Date.now()}_${offerData.team_id}`;
  
  // Calculate expiration (48h from first offer)
  const firstOfferTime = await getFirstOfferTime(offerData.season, offerData.player_id);
  const expiresAt = firstOfferTime || new Date(Date.now() + 48 * 60 * 60 * 1000);
  
  const offer = {
    offer_id: offerId,
    season: offerData.season,
    player_id: offerData.player_id,
    player_name: offerData.player_name,
    player_experience: offerData.player_experience,
    
    team_id: offerData.team_id,
    team_name: offerData.team_name,
    gm_id: offerData.gm_id,
    gm_name: offerData.gm_name,
    
    contract: {
      years: offerData.years,
      annual_salary: offerData.annual_salary,
      total_value: offerData.annual_salary * offerData.years,
      funding: offerData.funding,
      option: {
        type: offerData.option_type || 'none',
        year: offerData.option_year || null
      }
    },
    
    validation: {
      min_salary_required: getMinimumSalary(offerData.player_experience),
      is_valid: true,
      cap_space_at_offer: offerData.cap_space_at_offer || 0
    },
    
    status: 'pending',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: admin.firestore.Timestamp.fromDate(expiresAt),
    decided_at: null,
    decision_reason: null
  };
  
  // Save offer
  await db.collection('fa_offers').doc(offerId).set(offer);
  
  // Add offer to player's current_offers
  // NOTE: Player status remains "available" until they sign!
  // Status only changes to "signed" after 48h timer + player accepts
  await db.collection('free_agents').doc(`fa_${offerData.season}`).update({
    [`players.${offerData.player_id}.current_offers`]: admin.firestore.FieldValue.arrayUnion(offerId),
    'updated_at': admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`✅ Created offer ${offerId} for ${offerData.player_name}`);
  
  return offer;
}

/**
 * Get first offer time for a player (for 48h timer)
 */
async function getFirstOfferTime(season, playerId) {
  const db = admin.firestore();
  
  const offersSnapshot = await db.collection('fa_offers')
    .where('season', '==', season)
    .where('player_id', '==', playerId)
    .where('status', '==', 'pending')
    .orderBy('created_at', 'asc')
    .limit(1)
    .get();
  
  if (offersSnapshot.empty) {
    return null;
  }
  
  const firstOffer = offersSnapshot.docs[0].data();
  const firstOfferTime = firstOffer.created_at.toDate();
  
  // Return expiration time (48h from first offer)
  return new Date(firstOfferTime.getTime() + 48 * 60 * 60 * 1000);
}

/**
 * Get all offers for a player
 */
async function getPlayerOffers(season, playerId) {
  const db = admin.firestore();
  
  const offersSnapshot = await db.collection('fa_offers')
    .where('season', '==', season)
    .where('player_id', '==', playerId)
    .where('status', '==', 'pending')
    .get();
  
  return offersSnapshot.docs.map(doc => doc.data());
}

/**
 * Get all offers by a team
 */
async function getTeamOffers(season, teamId, status = null) {
  const db = admin.firestore();
  
  let query = db.collection('fa_offers')
    .where('season', '==', season)
    .where('team_id', '==', teamId);
  
  if (status) {
    query = query.where('status', '==', status);
  }
  
  const offersSnapshot = await query.get();
  
  return offersSnapshot.docs.map(doc => doc.data());
}

// ───────────────────────────────────────────────────────
// EXPORTS
// ───────────────────────────────────────────────────────

module.exports = {
  // Utilities
  getMinimumSalary,
  ALPHABET_GROUPS,
  getAlphabetGroup,
  getPlayersInGroup,
  
  // FA Market
  importFAMarket,
  getFAMarket,
  getPlayer,
  getAvailablePlayers,
  updatePlayerStatus,
  addPlayerToMarket,
  removePlayerFromMarket,
  
  // Offers
  createOffer,
  getFirstOfferTime,
  getPlayerOffers,
  getTeamOffers
};