// ═══════════════════════════════════════════════════════
// FA DECISION SERVICE
// Automatic decision algorithm based on Loyalty, Money, Win
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');
const { EmbedBuilder } = require('discord.js');
const { updatePlayerStatus } = require('./freeAgentService');

// ═══════════════════════════════════════════════════════
// DECISION ALGORITHM
// ═══════════════════════════════════════════════════════

/**
 * Calculate player interest in an offer
 * Based on: Money Importance, Win Importance, Loyalty
 */
function calculatePlayerInterest(player, offer, teamRecord) {
  let score = 0;
  
  // 1. MONEY COMPONENT (max 100 points)
  // $20M = max score, scales linearly
  const moneyScore = Math.min((offer.contract.annual_salary / 20000000) * 100, 100);
  score += moneyScore * (player.money_imp / 100);
  
  // 2. WINNING COMPONENT (max 100 points)
  // Based on team win percentage
  const teamPct = teamRecord.wins / (teamRecord.wins + teamRecord.losses || 1);
  const winScore = teamPct * 100;
  score += winScore * (player.win_imp / 100);
  
  // 3. LOYALTY COMPONENT (penalty if leaving previous team)
  if (player.previous_team && offer.team_id !== player.previous_team) {
    // Penalize leaving previous team
    score -= player.loyalty * 0.5; // Max -50 points
  } else if (player.previous_team && offer.team_id === player.previous_team) {
    // Bonus for staying with same team
    score += player.loyalty * 0.3; // Max +30 points
  }
  
  // 4. YEARS BONUS (prefer stability)
  // Longer contracts = more attractive
  score += offer.contract.years * 5; // +5 per year
  
  // 5. AGE FACTOR
  // Veterans prefer shorter deals
  if (player.age > 32 && offer.contract.years > 2) {
    score -= 10; // Penalty for long deals to old players
  }
  
  // 6. ROLE IMPORTANCE (higher overall = wants more money)
  if (player.overall >= 75 && offer.contract.annual_salary < 8000000) {
    score -= 15; // Star players want star money
  }
  
  return Math.max(0, score); // Never negative
}

/**
 * Decide which offer to accept (if any)
 */
async function decideFreeAgent(player, offers, guild) {
  const db = admin.firestore();
  
  console.log(`\n🎲 Deciding for ${player.name} among ${offers.length} offers...`);
  
  let bestOffer = null;
  let bestScore = 0;
  const offerScores = [];
  
  // Evaluate each offer
  for (const offer of offers) {
    // Get team record
    const teamStandings = await db.collection('standings').doc('2025-26').get();
    const teamRecord = teamStandings.data()?.teams?.[offer.team_id] || { wins: 0, losses: 0 };
    
    // Calculate score
    const score = calculatePlayerInterest(player, offer, teamRecord);
    
    offerScores.push({
      offer,
      score,
      team: offer.team_name
    });
    
    console.log(`  ${offer.team_name}: ${score.toFixed(1)} pts (${offer.contract.years}yr/$${(offer.contract.annual_salary / 1000000).toFixed(1)}M)`);
    
    if (score > bestScore) {
      bestScore = score;
      bestOffer = offer;
    }
  }
  
  // Decision threshold: score must be >= 60 to accept
  const ACCEPTANCE_THRESHOLD = 60;
  
  if (bestScore >= ACCEPTANCE_THRESHOLD && bestOffer) {
    console.log(`  ✅ ACCEPTED: ${bestOffer.team_name} (score: ${bestScore.toFixed(1)})`);
    
    // Accept best offer
    await acceptOffer(bestOffer, player, guild);
    
    // Reject others
    for (const offer of offers) {
      if (offer.offer_id !== bestOffer.offer_id) {
        await rejectOffer(offer, `Player signed with ${bestOffer.team_name}`, guild);
      }
    }
    
    return {
      decision: 'accept',
      winning_team: bestOffer.team_name,
      contract: bestOffer.contract,
      score: bestScore,
      all_scores: offerScores
    };
    
  } else {
    console.log(`  ❌ REJECTED ALL (best score: ${bestScore.toFixed(1)}, threshold: ${ACCEPTANCE_THRESHOLD})`);
    
    // Reject all offers
    for (const offer of offers) {
      await rejectOffer(offer, 'No satisfactory offers', guild);
    }
    
    return {
      decision: 'reject_all',
      reason: `Best offer scored ${bestScore.toFixed(1)} (threshold: ${ACCEPTANCE_THRESHOLD})`,
      all_scores: offerScores
    };
  }
}

// ═══════════════════════════════════════════════════════
// ACCEPT OFFER
// ═══════════════════════════════════════════════════════

async function acceptOffer(offer, player, guild) {
  const db = admin.firestore();
  
  try {
    // 1. Update offer status
    await db.collection('fa_offers').doc(offer.offer_id).update({
      status: 'accepted',
      decided_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 2. Add player to team roster
    const teamDoc = await db.collection('teams').doc(offer.team_id).get();
    const team = teamDoc.data();
    
    const playerContract = {
      player_id: player.player_id,
      name: player.name,
      position: player.role,
      age: player.age,
      overall: player.overall,
      experience: player.experience,
      contract: {
        years: offer.contract.years,
        annual_salary: offer.contract.annual_salary,
        total_value: offer.contract.total_value,
        signed_date: new Date(),
        expires_year: new Date().getFullYear() + offer.contract.years
      }
    };
    
    await db.collection('teams').doc(offer.team_id).update({
      roster: admin.firestore.FieldValue.arrayUnion(playerContract),
      'salary_cap.salary_used': admin.firestore.FieldValue.increment(offer.contract.annual_salary),
      'salary_cap.cap_space': admin.firestore.FieldValue.increment(-offer.contract.annual_salary),
      'salary_cap.pending_offers.total': admin.firestore.FieldValue.increment(-offer.contract.annual_salary),
      'salary_cap.available_cap': team.salary_cap.cap_space - offer.contract.annual_salary
    });
    
    // 3. Update player status to signed
    await updatePlayerStatus(offer.season, player.player_id, 'signed', {
      signed_team: offer.team_id,
      signed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 4. Send notifications
    await sendAcceptanceNotifications(offer, player, guild);
    
    console.log(`✅ ${player.name} signed with ${offer.team_name}`);
    
  } catch (error) {
    console.error('Error accepting offer:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════
// REJECT OFFER
// ═══════════════════════════════════════════════════════

async function rejectOffer(offer, reason, guild) {
  const db = admin.firestore();
  
  try {
    // 1. Update offer status
    await db.collection('fa_offers').doc(offer.offer_id).update({
      status: 'rejected',
      decided_at: admin.firestore.FieldValue.serverTimestamp(),
      decision_reason: reason
    });
    
    // 2. Free up team's pending cap
    const teamDoc = await db.collection('teams').doc(offer.team_id).get();
    const team = teamDoc.data();
    
    await db.collection('teams').doc(offer.team_id).update({
      'salary_cap.pending_offers.total': admin.firestore.FieldValue.increment(-offer.contract.annual_salary),
      'salary_cap.available_cap': team.salary_cap.cap_space - ((team.salary_cap.pending_offers?.total || 0) - offer.contract.annual_salary)
    });
    
    // 3. Send notification
    await sendRejectionNotification(offer, reason, guild);
    
    console.log(`❌ ${offer.player_name} rejected ${offer.team_name}'s offer`);
    
  } catch (error) {
    console.error('Error rejecting offer:', error);
  }
}

// ═══════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════

async function sendAcceptanceNotifications(offer, player, guild) {
  try {
    // 1. Winning team notification (in their channel)
    const teamChannel = guild.channels.cache.find(ch =>
      ch.name.endsWith(`-${offer.team_id}-hq`)
    );
    
    if (teamChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎉 FREE AGENT ACCEPTED!')
        .setDescription(
          `**${player.name}**\n\n` +
          `"I'm excited to join the ${offer.team_name} and help bring a championship!"`
        )
        .addFields(
          { name: '📋 Contract', value: `${offer.contract.years} years\n$${(offer.contract.total_value / 1000000).toFixed(1)}M total\n$${(offer.contract.annual_salary / 1000000).toFixed(1)}M per year`, inline: true },
          { name: '🏀 Player Info', value: `${player.role}\nOVR ${player.overall}\n${player.age} years old`, inline: true }
        );
      
      await teamChannel.send({ embeds: [embed] });
    }
    
    // 2. Public announcement
    const announcementsChannel = guild.channels.cache.find(ch =>
      ch.name === '📰-announcements' || ch.name.includes('announcements')
    );
    
    if (announcementsChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🖊️ FREE AGENT SIGNING')
        .setDescription(`**${player.name}** has signed with the **${offer.team_name}**!`)
        .addFields(
          { name: '📋 Contract Details', value: `• Duration: ${offer.contract.years} years\n• Total Value: $${(offer.contract.total_value / 1000000).toFixed(1)}M\n• Annual Salary: $${(offer.contract.annual_salary / 1000000).toFixed(1)}M`, inline: true },
          { name: '🏀 Player', value: `• Position: ${player.role}\n• Overall: ${player.overall}\n• Age: ${player.age}`, inline: true }
        );
      
      await announcementsChannel.send({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('Error sending acceptance notifications:', error);
  }
}

async function sendRejectionNotification(offer, reason, guild) {
  try {
    // Team notification (in their channel)
    const teamChannel = guild.channels.cache.find(ch =>
      ch.name.endsWith(`-${offer.team_id}-hq`)
    );
    
    if (teamChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ FREE AGENT DECLINED')
        .setDescription(
          `**${offer.player_name}**\n\n` +
          `"${reason}"\n\n` +
          `Your cap space has been restored.`
        );
      
      await teamChannel.send({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('Error sending rejection notification:', error);
  }
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  calculatePlayerInterest,
  decideFreeAgent,
  acceptOffer,
  rejectOffer
};