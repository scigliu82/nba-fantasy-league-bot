const admin = require('firebase-admin');
const { validateTrade, formatValidationForDiscord } = require('./tradeValidationService');

// ═══════════════════════════════════════════════════════
// TRADE SERVICE - Business Logic
// ═══════════════════════════════════════════════════════

/**
 * Crea un nuovo trade proposto
 * @param {string} proposedBy - User ID del GM che propone
 * @param {Object} tradeData - Dati del trade
 * @returns {Object} - Trade creato con ID
 */
async function createTrade(proposedBy, tradeData) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  console.log('📝 Creating new trade proposal...');
  
  try {
    // Genera trade ID unico
    const tradesRef = db.collection('trades');
    const snapshot = await tradesRef.orderBy('created_at', 'desc').limit(1).get();
    
    let tradeNumber = 1;
    if (!snapshot.empty) {
      const lastTrade = snapshot.docs[0].data();
      const lastNumber = parseInt(lastTrade.id.split('_')[1]);
      tradeNumber = lastNumber + 1;
    }
    
    const tradeId = `trade_${tradeNumber}`;
    
    // Struttura completa del trade
    const trade = {
      id: tradeId,
      number: tradeNumber,
      status: 'proposed',
      
      // Teams involved
      teams: tradeData.teams,
      
      // Trade details per team
      ...tradeData.tradeDetails,
      
      // Validation
      validation: null, // Sarà popolato dopo
      
      // Proposer
      proposed_by: proposedBy,
      proposed_at: admin.firestore.FieldValue.serverTimestamp(),
      
      // Acceptances - Il proposer accetta automaticamente
      acceptances: {
        [tradeData.teams[0]]: {
          user_id: proposedBy,
          accepted_at: admin.firestore.FieldValue.serverTimestamp()
        }
      },
      
      // Commissioner
      commissioner_decision: null,
      commissioner_user_id: null,
      commissioner_at: null,
      veto_reason: null,
      
      // Execution
      executed: false,
      executed_at: null,
      
      // Metadata
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Valida il trade
    console.log('🔍 Validating trade...');
    const validation = await validateTrade(trade);
    trade.validation = validation;
    
    if (!validation.valid) {
      console.log('❌ Trade validation failed');
      return {
        success: false,
        error: 'Trade validation failed',
        validation: validation
      };
    }
    
    // Salva trade nel database
    await tradesRef.doc(tradeId).set(trade);
    
    console.log(`✅ Trade ${tradeId} created successfully`);
    
    return {
      success: true,
      tradeId: tradeId,
      trade: {
        id: tradeId,
        number: tradeNumber,
        ...trade
      }
    };
    
  } catch (error) {
    console.error('❌ Error creating trade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Invia notifica trade al team opponent
 * @param {Object} client - Discord client
 * @param {Object} trade - Trade object completo
 * @param {string} proposerTeamId - ID del team che ha proposto
 * @returns {Object} - Risultato operazione
 */
async function sendTradeNotification(client, trade, proposerTeamId) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const db = admin.firestore();
  
  try {
    console.log('📤 Sending trade notification...');
    
    // Determina opponent team
    const opponentTeamId = trade.teams.find(t => t !== proposerTeamId);
    
    if (!opponentTeamId) {
      console.error('❌ Cannot determine opponent team');
      return { success: false, error: 'Cannot determine opponent team' };
    }
    
    // Fetch team data
    const proposerTeamDoc = await db.collection('teams').doc(proposerTeamId).get();
    const opponentTeamDoc = await db.collection('teams').doc(opponentTeamId).get();
    
    if (!proposerTeamDoc.exists || !opponentTeamDoc.exists) {
      console.error('❌ Team not found');
      return { success: false, error: 'Team not found' };
    }
    
    const proposerTeamData = proposerTeamDoc.data();
    const opponentTeamData = opponentTeamDoc.data();
    
    // Trova canale HQ opponent (cerca qualsiasi canale che finisce con -teamId-hq)
    const channel = client.channels.cache.find(ch => 
      ch.name.endsWith(`-${opponentTeamId}-hq`)
    );
    
    if (!channel) {
      console.error(`❌ Channel ending with -${opponentTeamId}-hq not found`);
      return { success: false, error: `Channel for ${opponentTeamId} not found` };
    }
    
    console.log(`✅ Found channel: ${channel.name}`);
    
    // Prepara player lists
    const proposerSends = trade[`${proposerTeamId}_sends`];
    const proposerReceives = trade[`${proposerTeamId}_receives`];
    
    const sendsList = proposerSends.players.map(p => 
      `• ${p.name} (${p.overall} OVR, $${(p.salary / 1000000).toFixed(1)}M)`
    ).join('\n') || 'None';
    
    const receivesList = proposerReceives.players.map(p => 
      `• ${p.name} (${p.overall} OVR, $${(p.salary / 1000000).toFixed(1)}M)`
    ).join('\n') || 'None';
    
    // Crea embed
    const embed = new EmbedBuilder()
      .setTitle('🔔 NEW TRADE PROPOSAL')
      .setDescription(`**${proposerTeamData.name}** has proposed a trade with **${opponentTeamData.name}**`)
      .setColor(0x0099FF)
      .addFields(
        {
          name: `${proposerTeamData.name} sends to you:`,
          value: receivesList + `\n\n**Total:** $${(proposerReceives.total_salary / 1000000).toFixed(1)}M`,
          inline: false
        },
        {
          name: `You send to ${proposerTeamData.name}:`,
          value: sendsList + `\n\n**Total:** $${(proposerSends.total_salary / 1000000).toFixed(1)}M`,
          inline: false
        },
        {
          name: 'Trade Details',
          value: `**Trade ID:** \`${trade.id}\`\n**Status:** ${trade.status}\n**Proposed:** <t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: false
        }
      )
      .setFooter({ text: 'Accept or decline this trade proposal' })
      .setTimestamp();
    
    // Crea bottoni
    const acceptButton = new ButtonBuilder()
      .setCustomId(`trade_accept_${trade.id}_${opponentTeamId}`)
      .setLabel('Accept Trade')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');
    
    const declineButton = new ButtonBuilder()
      .setCustomId(`trade_decline_${trade.id}_${opponentTeamId}`)
      .setLabel('Decline Trade')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');
    
    const row = new ActionRowBuilder().addComponents(acceptButton, declineButton);
    
    // Invia messaggio
    const message = await channel.send({
      content: `📢 **Trade Proposal Received!**`,
      embeds: [embed],
      components: [row]
    });
    
    // Salva message ID nel trade per reference
    await db.collection('trades').doc(trade.id).update({
      notification_message_id: message.id,
      notification_channel_id: channel.id
    });
    
    console.log(`✅ Trade notification sent to ${channel.name}`);
    
    return { 
      success: true, 
      messageId: message.id,
      channelId: channel.id 
    };
    
  } catch (error) {
    console.error('❌ Error sending trade notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Invia notifica al commissioner quando trade è pending approval
 * @param {Object} client - Discord client
 * @param {string} tradeId - ID del trade
 * @returns {Object} - Risultato operazione
 */
async function sendCommissionerNotification(client, tradeId) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const db = admin.firestore();
  
  try {
    console.log('📤 Sending commissioner notification...');
    
    // Fetch trade data
    const tradeDoc = await db.collection('trades').doc(tradeId).get();
    
    if (!tradeDoc.exists) {
      console.error('❌ Trade not found');
      return { success: false, error: 'Trade not found' };
    }
    
    const trade = { id: tradeId, ...tradeDoc.data() };
    
    // Fetch team data
    const team1Doc = await db.collection('teams').doc(trade.teams[0]).get();
    const team2Doc = await db.collection('teams').doc(trade.teams[1]).get();
    
    if (!team1Doc.exists || !team2Doc.exists) {
      console.error('❌ Team not found');
      return { success: false, error: 'Team not found' };
    }
    
    const team1Data = team1Doc.data();
    const team2Data = team2Doc.data();
    
    // Trova canale commissioner-office
    console.log('🔍 Searching for commissioner channel...');
    console.log('📋 Available channels:', client.channels.cache.map(ch => ch.name).join(', '));
    
    const commissionerChannel = client.channels.cache.find(ch => 
      ch.name === 'commissioner-office' || ch.name.includes('commissioner')
    );
    
    if (!commissionerChannel) {
      console.error('❌ Commissioner office channel not found');
      console.error('📋 Searched for: "commissioner-office" or any channel containing "commissioner"');
      console.error('💡 Available text channels:', client.channels.cache
        .filter(ch => ch.type === 0) // Text channels
        .map(ch => ch.name)
        .join(', '));
      return { success: false, error: 'Commissioner office channel not found' };
    }
    
    console.log(`✅ Found commissioner channel: ${commissionerChannel.name}`);
    
    // Prepara player lists
    const team1Sends = trade[`${trade.teams[0]}_sends`];
    const team1Receives = trade[`${trade.teams[0]}_receives`];
    const team2Sends = trade[`${trade.teams[1]}_sends`];
    const team2Receives = trade[`${trade.teams[1]}_receives`];
    
    const team1SendsList = team1Sends.players.map(p => 
      `• ${p.name} (${p.overall} OVR, $${(p.salary / 1000000).toFixed(1)}M)`
    ).join('\n') || 'None';
    
    const team2SendsList = team2Sends.players.map(p => 
      `• ${p.name} (${p.overall} OVR, $${(p.salary / 1000000).toFixed(1)}M)`
    ).join('\n') || 'None';
    
    // Conta acceptances
    const acceptanceCount = Object.keys(trade.acceptances || {}).length;
    const totalTeams = trade.teams.length;
    
    // Crea embed
    const embed = new EmbedBuilder()
      .setTitle('⚖️ TRADE READY FOR APPROVAL')
      .setDescription(`**Trade #${trade.number}:** ${team1Data.name} ⇄ ${team2Data.name}`)
      .setColor(0xFFA500) // Orange
      .addFields(
        {
          name: `${team1Data.name} sends:`,
          value: team1SendsList + `\n\n**Total:** $${(team1Sends.total_salary / 1000000).toFixed(1)}M`,
          inline: false
        },
        {
          name: `${team2Data.name} sends:`,
          value: team2SendsList + `\n\n**Total:** $${(team2Sends.total_salary / 1000000).toFixed(1)}M`,
          inline: false
        },
        {
          name: 'Trade Status',
          value: `**Status:** ${trade.status}\n**Acceptances:** ${acceptanceCount}/${totalTeams} teams\n**Trade ID:** \`${tradeId}\`\n**Proposed:** <t:${Math.floor(trade.created_at?.toDate?.()?.getTime?.() / 1000 || Date.now() / 1000)}:R>`,
          inline: false
        }
      )
      .setFooter({ text: 'Approve or veto this trade' })
      .setTimestamp();
    
    // Crea bottoni
    const approveButton = new ButtonBuilder()
      .setCustomId(`trade_approve_${tradeId}`)
      .setLabel('Approve Trade')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');
    
    const vetoButton = new ButtonBuilder()
      .setCustomId(`trade_veto_${tradeId}`)
      .setLabel('Veto Trade')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');
    
    const row = new ActionRowBuilder().addComponents(approveButton, vetoButton);
    
    // Invia messaggio
    const message = await commissionerChannel.send({
      content: '📢 **New Trade Pending Approval!**',
      embeds: [embed],
      components: [row]
    });
    
    // Salva message ID nel trade per reference
    await db.collection('trades').doc(tradeId).update({
      commissioner_notification_message_id: message.id,
      commissioner_notification_channel_id: commissionerChannel.id
    });
    
    console.log(`✅ Commissioner notification sent to ${commissionerChannel.name}`);
    
    return { 
      success: true, 
      messageId: message.id,
      channelId: commissionerChannel.id 
    };
    
  } catch (error) {
    console.error('❌ Error sending commissioner notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * GM accetta un trade
 * @param {string} tradeId - ID del trade
 * @param {string} userId - User ID del GM
 * @param {string} teamId - Team ID del GM
 * @param {Object} client - Discord client (opzionale, per notifiche)
 * @returns {Object} - Risultato operazione
 */
async function acceptTrade(tradeId, userId, teamId, client = null) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  console.log(`✅ ${teamId} accepting trade ${tradeId}...`);
  
  try {
    const tradeRef = db.collection('trades').doc(tradeId);
    const tradeDoc = await tradeRef.get();
    
    if (!tradeDoc.exists) {
      return {
        success: false,
        error: 'Trade not found'
      };
    }
    
    const trade = tradeDoc.data();
    
    // Verifica che il trade sia nello stato corretto
    if (trade.status !== 'proposed' && trade.status !== 'partially_accepted') {
      return {
        success: false,
        error: `Cannot accept trade in status: ${trade.status}`
      };
    }
    
    // Verifica che il team sia coinvolto nel trade
    if (!trade.teams.includes(teamId)) {
      return {
        success: false,
        error: 'Your team is not involved in this trade'
      };
    }
    
    // Verifica che il team non abbia già accettato
    if (trade.acceptances[teamId]) {
      return {
        success: false,
        error: 'You have already accepted this trade'
      };
    }
    
    // Aggiungi accettazione
    const updatedAcceptances = {
      ...trade.acceptances,
      [teamId]: {
        user_id: userId,
        accepted_at: admin.firestore.FieldValue.serverTimestamp()
      }
    };
    
    // Conta quanti team hanno accettato
    const acceptedCount = Object.keys(updatedAcceptances).length;
    const totalTeams = trade.teams.length;
    
    // Determina nuovo status
    let newStatus;
    if (acceptedCount === totalTeams) {
      // Tutti i team hanno accettato (proposer accetta automaticamente + opponent accetta)
      newStatus = 'pending_approval';
    } else {
      newStatus = 'partially_accepted';
    }
    
    // Aggiorna trade
    await tradeRef.update({
      acceptances: updatedAcceptances,
      status: newStatus,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ ${teamId} accepted trade ${tradeId} (status: ${newStatus})`);
    
    // Se il trade è pronto per l'approvazione del commissioner, invia notifica
    if (newStatus === 'pending_approval' && client) {
      console.log(`📤 Trade ready for commissioner approval, sending notification...`);
      const notificationResult = await sendCommissionerNotification(client, tradeId);
      
      if (!notificationResult.success) {
        console.error(`⚠️ Failed to send commissioner notification: ${notificationResult.error}`);
        // Non blocchiamo il flow, il commissioner può comunque usare /trade-pending
      }
    }
    
    return {
      success: true,
      newStatus: newStatus,
      needsCommissionerApproval: newStatus === 'pending_approval'
    };
    
  } catch (error) {
    console.error('❌ Error accepting trade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * GM rifiuta un trade
 * @param {string} tradeId - ID del trade
 * @param {string} userId - User ID del GM
 * @param {string} teamId - Team ID del GM
 * @param {string} reason - Motivo del rifiuto (opzionale)
 * @returns {Object} - Risultato operazione
 */
async function rejectTrade(tradeId, userId, teamId, reason = null) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  console.log(`❌ ${teamId} rejecting trade ${tradeId}...`);
  
  try {
    const tradeRef = db.collection('trades').doc(tradeId);
    const tradeDoc = await tradeRef.get();
    
    if (!tradeDoc.exists) {
      return {
        success: false,
        error: 'Trade not found'
      };
    }
    
    const trade = tradeDoc.data();
    
    // Verifica che il trade sia nello stato corretto
    if (!['proposed', 'partially_accepted'].includes(trade.status)) {
      return {
        success: false,
        error: `Cannot reject trade in status: ${trade.status}`
      };
    }
    
    // Verifica che il team sia coinvolto
    if (!trade.teams.includes(teamId)) {
      return {
        success: false,
        error: 'Your team is not involved in this trade'
      };
    }
    
    // Aggiorna trade a rejected
    await tradeRef.update({
      status: 'rejected',
      rejected_by: teamId,
      rejected_user_id: userId,
      rejected_at: admin.firestore.FieldValue.serverTimestamp(),
      rejection_reason: reason,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Trade ${tradeId} rejected by ${teamId}`);
    
    return {
      success: true
    };
    
  } catch (error) {
    console.error('❌ Error rejecting trade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Commissioner approva un trade
 * @param {string} tradeId - ID del trade
 * @param {string} commissionerId - User ID del commissioner
 * @param {Client} client - Discord client (per auto-update roster)
 * @returns {Object} - Risultato operazione
 */
async function approveTrade(tradeId, commissionerId, client = null) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  console.log(`✅ Commissioner approving trade ${tradeId}...`);
  
  try {
    const tradeRef = db.collection('trades').doc(tradeId);
    const tradeDoc = await tradeRef.get();
    
    if (!tradeDoc.exists) {
      return {
        success: false,
        error: 'Trade not found'
      };
    }
    
    const trade = tradeDoc.data();
    
    // Verifica che il trade sia pending approval
    if (trade.status !== 'pending_approval') {
      return {
        success: false,
        error: `Cannot approve trade in status: ${trade.status}`
      };
    }
    
    // Aggiorna status a approved
    await tradeRef.update({
      status: 'approved',
      commissioner_decision: 'approved',
      commissioner_user_id: commissionerId,
      commissioner_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Esegui il trade (passa client per auto-update)
    const executionResult = await executeTrade(tradeId, client);
    
    if (!executionResult.success) {
      // Rollback approval
      await tradeRef.update({
        status: 'error',
        error_message: executionResult.error
      });
      
      return {
        success: false,
        error: `Trade approved but execution failed: ${executionResult.error}`
      };
    }
    
    console.log(`✅ Trade ${tradeId} approved and executed successfully`);
    
    return {
      success: true,
      executed: true,
      teamsInvolved: executionResult.teamsInvolved
    };
    
  } catch (error) {
    console.error('❌ Error approving trade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Commissioner veta un trade
 * @param {string} tradeId - ID del trade
 * @param {string} commissionerId - User ID del commissioner
 * @param {string} reason - Motivo del veto
 * @returns {Object} - Risultato operazione
 */
async function vetoTrade(tradeId, commissionerId, reason) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  console.log(`⛔ Commissioner vetoing trade ${tradeId}...`);
  
  try {
    const tradeRef = db.collection('trades').doc(tradeId);
    const tradeDoc = await tradeRef.get();
    
    if (!tradeDoc.exists) {
      return {
        success: false,
        error: 'Trade not found'
      };
    }
    
    const trade = tradeDoc.data();
    
    // Verifica che il trade sia pending approval
    if (trade.status !== 'pending_approval') {
      return {
        success: false,
        error: `Cannot veto trade in status: ${trade.status}`
      };
    }
    
    // Aggiorna status a vetoed
    await tradeRef.update({
      status: 'vetoed',
      commissioner_decision: 'vetoed',
      commissioner_user_id: commissionerId,
      commissioner_at: admin.firestore.FieldValue.serverTimestamp(),
      veto_reason: reason,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Trade ${tradeId} vetoed by commissioner`);
    
    return {
      success: true,
      reason: reason
    };
    
  } catch (error) {
    console.error('❌ Error vetoing trade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Esegue un trade approvato (aggiorna database)
 * @param {string} tradeId - ID del trade
 * @param {Client} client - Discord client (opzionale, per auto-update roster)
 * @returns {Object} - Risultato esecuzione
 */
async function executeTrade(tradeId, client = null) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  console.log(`⚙️ Executing trade ${tradeId}...`);
  
  try {
    const tradeDoc = await db.collection('trades').doc(tradeId).get();
    
    if (!tradeDoc.exists) {
      return {
        success: false,
        error: 'Trade not found'
      };
    }
    
    const trade = tradeDoc.data();
    
    // Trasferisci giocatori per ogni team
    // IMPORTANTE: Assegnare direttamente al team di destinazione, NON usare 'traded' temporaneo
    for (const teamId of trade.teams) {
      const sends = trade[`${teamId}_sends`];
      const receives = trade[`${teamId}_receives`];
      
      // Trova l'altro team (per trade a 2 team)
      const otherTeamId = trade.teams.find(t => t !== teamId);
      
      // Aggiorna giocatori che il team invia → vanno all'ALTRO team
      for (const player of sends.players) {
        await db.collection('players').doc(player.id).update({
          current_team: otherTeamId, // Assegna direttamente all'altro team
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`  ↗️ ${player.name} (${player.id}) → ${otherTeamId}`);
      }
    }
    
    // Marca trade come executed
    await db.collection('trades').doc(tradeId).update({
      executed: true,
      executed_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Trade ${tradeId} executed successfully`);
    
    // 🆕 Auto-update roster messages (se client disponibile)
    if (client) {
      console.log('🔄 Updating roster messages...');
      for (const teamId of trade.teams) {
        try {
          await updateTeamRosterMessage(client, teamId);
        } catch (error) {
          console.error(`⚠️ Failed to update roster message for ${teamId}:`, error.message);
          // Non bloccare l'esecuzione del trade per errori di update UI
        }
      }
    }
    
    return {
      success: true,
      teamsInvolved: trade.teams
    };
    
  } catch (error) {
    console.error('❌ Error executing trade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Aggiorna il roster message di un team dopo un trade
 * @param {Client} client - Discord client
 * @param {string} teamId - ID del team
 * @returns {Promise<boolean>} - Success status
 */
async function updateTeamRosterMessage(client, teamId) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  try {
    console.log(`📊 Updating roster message for ${teamId}...`);
    
    // Fetch team data
    const teamDoc = await db.collection('teams').doc(teamId).get();
    
    if (!teamDoc.exists) {
      console.warn(`Team ${teamId} not found in database`);
      return false;
    }
    
    const team = teamDoc.data();
    const rosterMessageId = team.discord?.roster_message_id;
    
    if (!rosterMessageId) {
      console.warn(`No roster message ID found for ${teamId}`);
      return false;
    }
    
    // Trova canale team HQ
    const guild = client.guilds.cache.first();
    
    if (!guild) {
      console.warn('No guild found');
      return false;
    }
    
    const channel = guild.channels.cache.find(ch => 
      ch.name.endsWith(`-${teamId}-hq`)
    );
    
    if (!channel) {
      console.warn(`Channel not found for ${teamId}`);
      return false;
    }
    
    // Rigenera roster message
    const rosterService = require('./rosterDisplayService');
    const newRoster = await rosterService.generateRosterMessage(teamId);
    
    // Fetch e aggiorna messaggio esistente
    const message = await channel.messages.fetch(rosterMessageId);
    await message.edit(newRoster);
    
    console.log(`✅ Roster message updated for ${teamId}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error updating roster message for ${teamId}:`, error);
    throw error;
  }
}

/**
 * Ottieni tutti i trade di un team
 * @param {string} teamId - ID del team
 * @param {string} status - Filtro per status (opzionale)
 * @returns {Array} - Lista trade
 */
async function getTeamTrades(teamId, status = null) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  try {
    let query = db.collection('trades').where('teams', 'array-contains', teamId);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.orderBy('created_at', 'desc').get();
    
    const trades = [];
    snapshot.forEach(doc => {
      trades.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return trades;
    
  } catch (error) {
    console.error('❌ Error fetching team trades:', error);
    return [];
  }
}

/**
 * Ottieni tutti i trade pending approval
 * @returns {Array} - Lista trade pending
 */
async function getPendingTrades() {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  try {
    console.log('🔍 Fetching pending trades...');
    console.log('📋 Query: status == "pending_approval", orderBy created_at');
    
    const snapshot = await db.collection('trades')
      .where('status', '==', 'pending_approval')
      .orderBy('created_at', 'asc')
      .get();
    
    console.log(`📊 Found ${snapshot.size} pending trades`);
    
    const trades = [];
    snapshot.forEach(doc => {
      const tradeData = doc.data();
      console.log(`  - Trade ${doc.id}: status=${tradeData.status}, teams=${tradeData.teams?.join(' vs ')}`);
      trades.push({
        id: doc.id,
        ...tradeData
      });
    });
    
    return trades;
    
  } catch (error) {
    console.error('❌ Error fetching pending trades:', error);
    console.error('💡 Error details:', error.message);
    console.error('💡 This might be an index issue - check Firebase Console');
    return [];
  }
}

/**
 * Ottieni un singolo trade per ID
 * @param {string} tradeId - ID del trade
 * @returns {Object|null} - Trade o null
 */
async function getTrade(tradeId) {
  const { getDatabase } = require("../database/firebase");
  const db = getDatabase();
  
  try {
    const doc = await db.collection('trades').doc(tradeId).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return {
      id: doc.id,
      ...doc.data()
    };
    
  } catch (error) {
    console.error('❌ Error fetching trade:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  createTrade,
  sendTradeNotification,
  sendCommissionerNotification,
  acceptTrade,
  rejectTrade,
  approveTrade,
  vetoTrade,
  executeTrade,
  updateTeamRosterMessage,
  getTeamTrades,
  getPendingTrades,
  getTrade
};