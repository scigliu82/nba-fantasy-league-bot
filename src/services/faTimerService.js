// ═══════════════════════════════════════════════════════
// FA TIMER SERVICE - Automatic 48h timer checker
// Controlla offerte scadute ogni 5 minuti e processa automaticamente
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');
const { EmbedBuilder } = require('discord.js');
const { decideFreeAgent } = require('./faDecisionService');
const { getPlayer } = require('./freeAgentService');

// ───────────────────────────────────────────────────────
// TIMER CHECKER
// ───────────────────────────────────────────────────────

let timerInterval = null;

/**
 * Start automatic timer checker
 */
function startFATimerChecker(client) {
  if (timerInterval) {
    console.log('[FA-TIMER] Timer already running');
    return;
  }
  
  console.log('[FA-TIMER] Starting automatic timer checker (every 5 minutes)');
  
  // Check immediately on start
  checkExpiredOffers(client);
  
  // Then check every 5 minutes
  timerInterval = setInterval(() => {
    checkExpiredOffers(client);
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Stop automatic timer checker
 */
function stopFATimerChecker() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    console.log('[FA-TIMER] Timer checker stopped');
  }
}

/**
 * Check for expired offers and process them
 */
async function checkExpiredOffers(client) {
  const db = admin.firestore();
  
  try {
    console.log('[FA-TIMER] Checking for expired offers...');
    
    const now = admin.firestore.Timestamp.now();
    
    // Get all pending offers that have expired
    const snapshot = await db.collection('fa_offers')
      .where('status', '==', 'pending')
      .where('expires_at', '<=', now)
      .get();
    
    if (snapshot.empty) {
      console.log('[FA-TIMER] No expired offers found');
      return;
    }
    
    console.log(`[FA-TIMER] Found ${snapshot.docs.length} expired offers to process`);
    
    // Group offers by player
    const offersByPlayer = {};
    
    for (const doc of snapshot.docs) {
      const offer = doc.data();
      const key = `${offer.season}_${offer.player_id}`;
      
      if (!offersByPlayer[key]) {
        offersByPlayer[key] = {
          season: offer.season,
          player_id: offer.player_id,
          player_name: offer.player_name,
          offers: []
        };
      }
      
      offersByPlayer[key].offers.push(offer);
    }
    
    // Process each player's offers
    for (const [key, playerData] of Object.entries(offersByPlayer)) {
      try {
        console.log(`[FA-TIMER] Processing expired offers for ${playerData.player_name}...`);
        
        await processExpiredPlayer(client, playerData.season, playerData.player_id, playerData.player_name);
        
        console.log(`[FA-TIMER] ✅ Processed ${playerData.player_name}`);
        
      } catch (error) {
        console.error(`[FA-TIMER] Error processing ${playerData.player_name}:`, error);
      }
      
      // Small delay between players to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('[FA-TIMER] Completed checking expired offers');
    
  } catch (error) {
    console.error('[FA-TIMER] Error in checkExpiredOffers:', error);
  }
}

/**
 * Process expired offers for a single player
 */
async function processExpiredPlayer(client, season, playerId, playerName) {
  try {
    // Get player data
    const player = await getPlayer(season, playerId);
    
    if (!player) {
      console.log(`[FA-TIMER] Player ${playerId} not found, skipping`);
      return;
    }
    
    // Run decision algorithm
    const result = await decideFreeAgent(player, null, client);
    
    if (!result) {
      console.log(`[FA-TIMER] No decision made for ${playerName}`);
      return;
    }
    
    // Send notifications
    await sendDecisionNotifications(client, season, player, result);
    
  } catch (error) {
    console.error(`[FA-TIMER] Error processing player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Send DMs and announcement after decision
 */
async function sendDecisionNotifications(client, season, player, result) {
  const db = admin.firestore();
  
  try {
    // Get all offers for this player
    const offersSnapshot = await db.collection('fa_offers')
      .where('season', '==', season)
      .where('player_id', '==', player.player_id)
      .get();
    
    const offers = offersSnapshot.docs.map(doc => doc.data());
    
    if (offers.length === 0) {
      console.log('[FA-TIMER] No offers found for notifications');
      return;
    }
    
    // Find winning offer
    const winningOffer = offers.find(o => o.status === 'accepted');
    
    if (!winningOffer) {
      console.log('[FA-TIMER] No winning offer found');
      return;
    }
    
    // Send DMs to all teams
    for (const offer of offers) {
      try {
        // Get GM user
        const gmUser = await client.users.fetch(offer.gm_id);
        
        if (!gmUser) continue;
        
        // Build DM embed
        let embed;
        
        if (offer.status === 'accepted') {
          // WINNING TEAM
          embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎉 CONGRATULAZIONI!')
            .setDescription(`**${player.name}** ha deciso di firmare con il tuo team!`)
            .addFields(
              { name: '🏀 Player', value: `${player.name}\n${player.role} • OVR ${player.overall}`, inline: true },
              { name: '💰 Contract', value: `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M per year\nTotal: $${(offer.contract.total_value / 1000000).toFixed(1)}M`, inline: true },
              { name: '💳 Funding', value: offer.contract.funding.toUpperCase(), inline: true }
            )
            .addFields({
              name: '✅ Next Steps',
              value: `• Player has been added to your roster\n• Cap space has been updated\n• Check your team HQ for details`
            })
            .setFooter({ text: `Decision made automatically after 48h` })
            .setTimestamp();
          
        } else {
          // LOSING TEAM
          embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Offerta Rifiutata')
            .setDescription(`**${player.name}** ha deciso di NON firmare con il tuo team.`)
            .addFields(
              { name: '🏀 Player', value: `${player.name}\n${player.role} • OVR ${player.overall}`, inline: true },
              { name: '💼 Signed With', value: `**${winningOffer.team_name}**\n${winningOffer.contract.years}yr / $${(winningOffer.contract.annual_salary / 1000000).toFixed(1)}M`, inline: true }
            )
            .addFields(
              { name: '📊 Your Offer', value: `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M\n${offer.contract.funding.toUpperCase()}`, inline: true },
              { name: '💡 Reason', value: offer.decision_reason || 'Player chose better offer', inline: false }
            )
            .addFields({
              name: '✅ Cap Space Released',
              value: `Your cap space/exception has been released and is available for new offers.`
            })
            .setFooter({ text: `Decision made automatically after 48h` })
            .setTimestamp();
        }
        
        // Send DM
        await gmUser.send({ embeds: [embed] });
        console.log(`[FA-TIMER] Sent DM to ${offer.gm_name}`);
        
      } catch (error) {
        console.error(`[FA-TIMER] Error sending DM to ${offer.gm_name}:`, error);
      }
    }
    
    // Send public announcement
    await sendPublicAnnouncement(client, player, winningOffer);
    
  } catch (error) {
    console.error('[FA-TIMER] Error sending notifications:', error);
  }
}

/**
 * Send public announcement to #announcements channel
 */
async function sendPublicAnnouncement(client, player, offer) {
  try {
    // Find announcements channel (you may need to adjust this)
    const guild = client.guilds.cache.first();
    if (!guild) return;
    
    const announcementChannel = guild.channels.cache.find(ch => 
      ch.name.includes('announcement') || ch.name.includes('announcements')
    );
    
    if (!announcementChannel) {
      console.log('[FA-TIMER] Announcements channel not found');
      return;
    }
    
    // Build option text
    let optionText = '';
    if (offer.contract.option?.type === 'player') {
      optionText = ` (Player Option ${offer.contract.option.year})`;
    } else if (offer.contract.option?.type === 'team') {
      optionText = ` (Team Option ${offer.contract.option.year})`;
    }
    
    // Build announcement embed
    const embed = new EmbedBuilder()
      .setColor(0x1D428A)
      .setTitle('📰 FREE AGENT SIGNING')
      .setDescription(`**${player.name}** has signed with **${offer.team_name}**!`)
      .addFields(
        { name: '🏀 Player', value: `${player.name}\n${player.role} • ${player.age}yr • OVR ${player.overall}`, inline: true },
        { name: '💰 Contract', value: `${offer.contract.years} year${offer.contract.years > 1 ? 's' : ''}\n$${(offer.contract.annual_salary / 1000000).toFixed(1)}M per year${optionText}\nTotal: $${(offer.contract.total_value / 1000000).toFixed(1)}M`, inline: true },
        { name: '💳 Funding', value: offer.contract.funding.toUpperCase(), inline: true }
      )
      .setFooter({ text: `Signed after 48h free agency period` })
      .setTimestamp();
    
    await announcementChannel.send({ embeds: [embed] });
    console.log(`[FA-TIMER] Sent announcement for ${player.name} → ${offer.team_name}`);
    
  } catch (error) {
    console.error('[FA-TIMER] Error sending announcement:', error);
  }
}

/**
 * Manually check and process expired offers (for testing)
 */
async function manualCheckExpired(client) {
  console.log('[FA-TIMER] Manual check triggered');
  await checkExpiredOffers(client);
}

module.exports = {
  startFATimerChecker,
  stopFATimerChecker,
  checkExpiredOffers,
  manualCheckExpired
};