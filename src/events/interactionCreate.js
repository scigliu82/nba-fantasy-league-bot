// ═══════════════════════════════════════════════════════
// INTERACTION CREATE EVENT - Handle slash commands & autocomplete
// ═══════════════════════════════════════════════════════

const { Events } = require('discord.js');

// Map per memorizzare le selezioni temporanee dei trade
// Struttura: tradeSelections.set('userTeamId_opponentTeamId', { send: [...], receive: [...] })
const tradeSelections = new Map();

module.exports = {
  name: Events.InteractionCreate,
  
  async execute(interaction) {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command || !command.autocomplete) {
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`❌ Error in autocomplete for ${interaction.commandName}:`, error);
      }
      return;
    }

    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`❌ No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        console.log(`📝 ${interaction.user.tag} used /${interaction.commandName}`);
        await command.execute(interaction);
        
      } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        // Send error message to user
        const errorMessage = {
          content: '❌ There was an error executing this command!',
          ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      }
      return;
    }
    
    // Handle button clicks
    if (interaction.isButton()) {
      const customId = interaction.customId;
      
      // Control Panel buttons
      if (customId.startsWith('cp_')) {
        try {
          await handleControlPanelButton(interaction);
        } catch (error) {
          console.error('❌ Error handling control panel button:', error);
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        }
      }
      
      // Trade approval buttons
      if (customId.startsWith('trade_approve_') || customId.startsWith('trade_veto_')) {
        try {
          await handleTradeActionButton(interaction);
        } catch (error) {
          console.error('❌ Error handling trade action button:', error);
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        }
      }
      
      // Trade accept/decline buttons (GM response)
      if (customId.startsWith('trade_accept_') || customId.startsWith('trade_decline_')) {
        try {
          await handleTradeResponseButtons(interaction);
        } catch (error) {
          console.error('❌ Error handling trade response button:', error);
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        }
      }
      
      // Trade preview/submit/cancel buttons
      if (customId.startsWith('trade_preview_') || customId === 'trade_submit' || customId === 'trade_cancel' || customId.startsWith('trade_cancel_')) {
        try {
          await handleTradeButtons(interaction);
        } catch (error) {
          console.error('❌ Error handling trade button:', error);
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        }
      }
      
      return;
    }
    
    // Handle string select menus
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      
      // Trade send/receive: salva selezioni e deferUpdate
      if (customId.startsWith('trade_send_') || customId.startsWith('trade_receive_')) {
        try {
          // Parse customId per ottenere team IDs
          const parts = customId.split('_');
          const action = parts[1]; // 'send' o 'receive'
          const userTeamId = parts[2];
          const opponentTeamId = parts[3];
          const tradeKey = `${userTeamId}_${opponentTeamId}`;
          
          // Ottieni o crea l'oggetto selezioni
          let selections = tradeSelections.get(tradeKey);
          if (!selections) {
            selections = { send: [], receive: [] };
          }
          
          // Salva la selezione
          selections[action] = interaction.values;
          tradeSelections.set(tradeKey, selections);
          
          console.log(`✅ Saved ${action} selection:`, interaction.values.length, 'players');
          
          await interaction.deferUpdate();
        } catch (error) {
          // Ignora errori (potrebbe essere già stata gestita)
          console.log('⚠️ DeferUpdate già gestito per', customId);
        }
        return;
      }
      
      // Trade conference/opponent selection
      if (customId.startsWith('trade_select_conference_') || customId.startsWith('trade_select_opponent_')) {
        try {
          await handleTradePlayerSelection(interaction);
        } catch (error) {
          console.error('❌ Error handling trade player selection:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ An error occurred while processing your selection.',
              ephemeral: true
            });
          }
        }
      }
      
      return;
    }
    
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      
      // Trade veto modal
      if (customId.startsWith('trade_veto_modal_')) {
        try {
          await handleTradeVetoModal(interaction);
        } catch (error) {
          console.error('❌ Error handling trade veto modal:', error);
          await interaction.reply({
            content: '❌ An error occurred while processing your veto.',
            ephemeral: true
          });
        }
      }
      
      return;
    }
  },
};

/**
 * Handler per i bottoni del Control Panel
 * @param {Interaction} interaction - Discord button interaction
 */
async function handleControlPanelButton(interaction) {
  const customId = interaction.customId;
  
  // Parse customId: cp_action_subaction_teamId
  // Example: cp_view_roster_lakers
  const parts = customId.split('_');
  const action = parts[1]; // "view", "cap", "propose", etc.
  const subaction = parts[2]; // "roster", "details", "trade", etc.
  const teamId = parts[parts.length - 1]; // "lakers", "celtics", etc.
  
  // === BOTTONI FUNZIONANTI ===
  
  // View Full Roster
  if (action === 'view' && subaction === 'roster') {
    const rosterService = require('../services/rosterDisplayService');
    const roster = await rosterService.generateRosterMessage(teamId);
    await interaction.reply({ 
      embeds: roster.embeds, 
      ephemeral: true 
    });
    return;
  }
  
  // Cap Details
  if (action === 'cap' && subaction === 'details') {
    const { getDatabase } = require('../database/firebase');
    const db = getDatabase();
    
    // Fetch team and players
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const team = teamDoc.data();
    
    const playersSnapshot = await db.collection('players')
      .where('current_team', '==', teamId)
      .get();
    
    // Calculate salary breakdown
    const currentSeason = '2025-26';
    let totalSalary = 0;
    const playerSalaries = [];
    
    playersSnapshot.forEach(doc => {
      const player = doc.data();
      const contract = player.contract?.[currentSeason];
      
      if (contract && contract.salary > 0) {
        totalSalary += contract.salary;
        playerSalaries.push({
          name: player.name,
          salary: contract.salary
        });
      }
    });
    
    // Sort by salary descending
    playerSalaries.sort((a, b) => b.salary - a.salary);
    
    // Salary cap constants
    const SALARY_CAP = 154647000;
    const LUXURY_TAX = 187895000;
    const FIRST_APRON = 195945000;
    const SECOND_APRON = 207824000;
    
    const capSpace = SALARY_CAP - totalSalary;
    const taxSpace = LUXURY_TAX - totalSalary;
    const firstApronSpace = FIRST_APRON - totalSalary;
    const secondApronSpace = SECOND_APRON - totalSalary;
    
    // Determine status
    let status;
    let statusEmoji;
    if (totalSalary < SALARY_CAP) {
      status = 'Under Cap';
      statusEmoji = '🟢';
    } else if (totalSalary < LUXURY_TAX) {
      status = 'Over Cap';
      statusEmoji = '🟢';
    } else if (totalSalary < FIRST_APRON) {
      status = 'Over Luxury Tax';
      statusEmoji = '🟡';
    } else if (totalSalary < SECOND_APRON) {
      status = 'Over First Apron';
      statusEmoji = '🟠';
    } else {
      status = 'Over Second Apron';
      statusEmoji = '🔴';
    }
    
    // Format response
    let response = `💰 **${team.name.toUpperCase()} - SALARY CAP DETAILS**\n\n`;
    response += `**Current Status:** ${statusEmoji} ${status}\n`;
    response += `**Total Salary:** $${(totalSalary / 1000000).toFixed(1)}M\n\n`;
    
    response += `**Distance from Thresholds:**\n`;
    response += `• Salary Cap ($154.6M): ${capSpace >= 0 ? '+' : ''}$${(capSpace / 1000000).toFixed(1)}M\n`;
    response += `• Luxury Tax ($187.9M): ${taxSpace >= 0 ? '+' : ''}$${(taxSpace / 1000000).toFixed(1)}M\n`;
    response += `• First Apron ($195.9M): ${firstApronSpace >= 0 ? '+' : ''}$${(firstApronSpace / 1000000).toFixed(1)}M\n`;
    response += `• Second Apron ($207.8M): ${secondApronSpace >= 0 ? '+' : ''}$${(secondApronSpace / 1000000).toFixed(1)}M\n\n`;
    
    response += `**Top 5 Salaries:**\n`;
    playerSalaries.slice(0, 5).forEach((p, i) => {
      response += `${i + 1}. ${p.name}: $${(p.salary / 1000000).toFixed(1)}M\n`;
    });
    
    await interaction.reply({
      content: response,
      ephemeral: true
    });
    return;
  }
  
  // Contract List
  if (action === 'contract' && subaction === 'list') {
    const { getDatabase } = require('../database/firebase');
    const db = getDatabase();
    
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const team = teamDoc.data();
    
    const playersSnapshot = await db.collection('players')
      .where('current_team', '==', teamId)
      .get();
    
    const seasons = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
    
    let response = `📋 **${team.name.toUpperCase()} - CONTRACT LIST**\n\n`;
    
    seasons.forEach(season => {
      const yearPlayers = [];
      let yearTotal = 0;
      
      playersSnapshot.forEach(doc => {
        const player = doc.data();
        const contract = player.contract?.[season];
        
        if (contract && contract.salary > 0) {
          yearTotal += contract.salary;
          
          let optionStr = '';
          if (contract.player_option) optionStr = ' 🔸PO';
          if (contract.team_option) optionStr = ' 🔹TO';
          
          yearPlayers.push({
            name: player.name,
            salary: contract.salary,
            option: optionStr
          });
        }
      });
      
      if (yearPlayers.length > 0) {
        response += `**${season}** (${yearPlayers.length} players, $${(yearTotal / 1000000).toFixed(1)}M)\n`;
        
        yearPlayers.sort((a, b) => b.salary - a.salary);
        yearPlayers.forEach(p => {
          response += `• ${p.name}: $${(p.salary / 1000000).toFixed(1)}M${p.option}\n`;
        });
        response += '\n';
      }
    });
    
    await interaction.reply({
      content: response,
      ephemeral: true
    });
    return;
  }
  
  // === BOTTONE: Propose Trade ===
  if (customId === 'cp_propose_trade') {
    return handleProposeTrade(interaction);
  }
  
  // === BOTTONI DISABILITATI (Coming Soon) ===
  
  // Tutti gli altri bottoni mostrano "Coming Soon"
  await interaction.reply({
    content: '🚧 **This feature is coming soon!**\n\nWe\'re working on implementing this functionality.',
    ephemeral: true
  });
}

/**
 * Handler per i bottoni trade approve/veto
 * @param {Interaction} interaction - Discord button interaction
 */
async function handleTradeActionButton(interaction) {
  const { EmbedBuilder } = require('discord.js');
  const { approveTrade, vetoTrade } = require('../services/tradeService');
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  const customId = interaction.customId;
  
  // Parse: trade_approve_trade_1 o trade_veto_trade_1
  const parts = customId.split('_');
  const action = parts[1]; // "approve" o "veto"
  const tradeId = parts.slice(2).join('_'); // "trade_1"
  
  await interaction.deferUpdate();
  
  try {
    if (action === 'approve') {
      // Approva trade
      console.log(`📝 Commissioner ${interaction.user.tag} approving trade ${tradeId}...`);
      
      const result = await approveTrade(tradeId, interaction.user.id, interaction.client);
      
      if (!result.success) {
        return interaction.followUp({
          content: `❌ Failed to approve trade: ${result.error}`,
          ephemeral: true
        });
      }
      
      // Fetch trade data per update embed
      const tradeDoc = await db.collection('trades').doc(tradeId).get();
      const trade = tradeDoc.data();
      
      // Fetch team names
      const team1Doc = await db.collection('teams').doc(trade.teams[0]).get();
      const team2Doc = await db.collection('teams').doc(trade.teams[1]).get();
      const team1Name = team1Doc.data().name;
      const team2Name = team2Doc.data().name;
      
      // Update embed
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x00FF00) // Green
        .setTitle('✅ TRADE APPROVED AND EXECUTED')
        .addFields({
          name: 'Status',
          value: `✅ Trade approved by ${interaction.user.tag}\n✅ Trade executed successfully\n✅ Rosters updated`,
          inline: false
        });
      
      // Update message (remove buttons)
      await interaction.editReply({
        embeds: [updatedEmbed],
        components: []
      });
      
      // Send confirmation
      await interaction.followUp({
        content: `✅ **TRADE APPROVED AND EXECUTED!**\n\nTrade #${trade.number}: ${team1Name} ⇄ ${team2Name}\n\n✅ Players transferred\n✅ Rosters updated in team HQ channels\n✅ Status: executed`,
        ephemeral: false
      });
      
    } else if (action === 'veto') {
      // Veta trade - chiedi reason
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId(`trade_veto_modal_${tradeId}`)
        .setTitle('Veto Trade');
      
      const reasonInput = new TextInputBuilder()
        .setCustomId('veto_reason')
        .setLabel('Reason for veto (minimum 10 characters)')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(500)
        .setPlaceholder('Explain why you are vetoing this trade...')
        .setRequired(true);
      
      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);
      
      await interaction.showModal(modal);
    }
    
  } catch (error) {
    console.error('❌ Error handling trade action:', error);
    await interaction.followUp({
      content: `❌ An error occurred: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handler per modal submit veto trade
 * @param {Interaction} interaction - Discord modal submit interaction
 */
async function handleTradeVetoModal(interaction) {
  const { EmbedBuilder } = require('discord.js');
  const { vetoTrade } = require('../services/tradeService');
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  // Parse tradeId da customId: trade_veto_modal_trade_1
  const tradeId = interaction.customId.replace('trade_veto_modal_', '');
  const vetoReason = interaction.fields.getTextInputValue('veto_reason');
  
  await interaction.deferUpdate();
  
  try {
    console.log(`⛔ Commissioner ${interaction.user.tag} vetoing trade ${tradeId}...`);
    console.log(`  Reason: ${vetoReason}`);
    
    const result = await vetoTrade(tradeId, interaction.user.id, vetoReason);
    
    if (!result.success) {
      return interaction.followUp({
        content: `❌ Failed to veto trade: ${result.error}`,
        ephemeral: true
      });
    }
    
    // Fetch trade data per update embed
    const tradeDoc = await db.collection('trades').doc(tradeId).get();
    const trade = tradeDoc.data();
    
    // Fetch team names
    const team1Doc = await db.collection('teams').doc(trade.teams[0]).get();
    const team2Doc = await db.collection('teams').doc(trade.teams[1]).get();
    const team1Name = team1Doc.data().name;
    const team2Name = team2Doc.data().name;
    
    // Update embed
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xFF0000) // Red
      .setTitle('❌ TRADE VETOED')
      .addFields({
        name: 'Veto Details',
        value: `⛔ Trade vetoed by ${interaction.user.tag}\n**Reason:** ${vetoReason}`,
        inline: false
      });
    
    // Update message (remove buttons)
    await interaction.editReply({
      embeds: [updatedEmbed],
      components: []
    });
    
    // Send confirmation
    await interaction.followUp({
      content: `⛔ **TRADE VETOED**\n\nTrade #${trade.number}: ${team1Name} ⇄ ${team2Name}\n\n**Vetoed by:** ${interaction.user.tag}\n**Reason:** ${vetoReason}\n\n❌ Status: vetoed`,
      ephemeral: false
    });
    
  } catch (error) {
    console.error('❌ Error vetoing trade:', error);
    await interaction.followUp({
      content: `❌ An error occurred: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handler per bottone [Propose Trade]
 * Mostra select menu per scegliere il team con cui fare trade
 */
async function handleProposeTrade(interaction) {
  const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  // Determina team del GM (dal nome del canale)
  const channelName = interaction.channel.name;
  const teamIdMatch = channelName.match(/-([a-z]+)-hq$/);
  
  if (!teamIdMatch) {
    return interaction.reply({
      content: '❌ Cannot determine your team from this channel.',
      ephemeral: true
    });
  }
  
  const userTeamId = teamIdMatch[1];
  
  // Fetch lista team (escludi il proprio)
  const teamsSnapshot = await db.collection('teams').get();
  const teams = [];
  
  teamsSnapshot.forEach(doc => {
    if (doc.id !== userTeamId) {
      teams.push({
        id: doc.id,
        name: doc.data().name || doc.id,
        conference: doc.data().conference || 'unknown'
      });
    }
  });
  
  // Crea select menu per Conference
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`trade_select_conference_${userTeamId}`)
    .setPlaceholder('Select a conference')
    .addOptions([
      {
        label: 'Eastern Conference',
        value: 'eastern',
        description: 'Trade with Eastern Conference teams',
        emoji: '🔵'
      },
      {
        label: 'Western Conference',
        value: 'western',
        description: 'Trade with Western Conference teams',
        emoji: '🔴'
      }
    ]);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  await interaction.reply({
    content: '🔄 **PROPOSE TRADE - Step 1/4**\n\n**Select Conference:**\nChoose which conference to trade with.',
    components: [row],
    ephemeral: true
  });
}

/**
 * Handler per selezione in trade menus
 */
async function handleTradePlayerSelection(interaction) {
  const customId = interaction.customId;
  // Ora possiamo fare gli import
  const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  // === SELEZIONE CONFERENCE ===
  if (customId.startsWith('trade_select_conference_')) {
    const userTeamId = customId.replace('trade_select_conference_', '');
    const selectedConference = interaction.values[0]; // "eastern" o "western"
    
    await interaction.deferUpdate();
    
    // Fetch team della conference selezionata
    const teamsSnapshot = await db.collection('teams').get();
    const teams = [];
    
    teamsSnapshot.forEach(doc => {
      const teamData = doc.data();
      const teamConference = (teamData.conference || '').toLowerCase();
      
      // Escludi il proprio team e filtra per conference
      if (doc.id !== userTeamId && teamConference === selectedConference) {
        teams.push({
          id: doc.id,
          name: teamData.name || doc.id
        });
      }
    });
    
    if (teams.length === 0) {
      return interaction.editReply({
        content: `❌ No teams found in ${selectedConference} conference.`,
        components: []
      });
    }
    
    // Ordina alfabeticamente
    teams.sort((a, b) => a.name.localeCompare(b.name));
    
    // Crea select menu con team della conference
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`trade_select_opponent_${userTeamId}`)
      .setPlaceholder('Select a team to trade with')
      .addOptions(
        teams.map(team => ({
          label: team.name,
          value: team.id,
          description: `Trade with ${team.name}`
        }))
      );
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const conferenceEmoji = selectedConference === 'eastern' ? '🔵' : '🔴';
    
    await interaction.editReply({
      content: `🔄 **PROPOSE TRADE - Step 2/4**\n\n${conferenceEmoji} **${selectedConference.toUpperCase()} CONFERENCE**\n\nSelect the team you want to trade with:\n\n*Found ${teams.length} team(s)*`,
      components: [row]
    });
    
    return;
  }
  
  // === SELEZIONE OPPONENT ===
  if (customId.startsWith('trade_select_opponent_')) {
    const userTeamId = customId.replace('trade_select_opponent_', '');
    const opponentTeamId = interaction.values[0];
    
    await interaction.deferUpdate();
    
    // Fetch players dei due team
    const userPlayers = await getTeamPlayers(userTeamId);
    const opponentPlayers = await getTeamPlayers(opponentTeamId);
    
    if (userPlayers.length === 0) {
      return interaction.editReply({
        content: '❌ Your team has no players to trade.',
        components: []
      });
    }
    
    if (opponentPlayers.length === 0) {
      return interaction.editReply({
        content: '❌ The selected team has no players to trade.',
        components: []
      });
    }
    
    // Crea select menus
    const sendMenu = new StringSelectMenuBuilder()
      .setCustomId(`trade_send_${userTeamId}_${opponentTeamId}`)
      .setPlaceholder('Select players to send (your team)')
      .setMinValues(1)
      .setMaxValues(Math.min(5, userPlayers.length))
      .addOptions(
        userPlayers.slice(0, 25).map(player => ({
          label: `${player.name} (${player.overall} OVR)`,
          value: player.id,
          description: `$${(player.salary / 1000000).toFixed(1)}M - ${player.position}`
        }))
      );
    
    const receiveMenu = new StringSelectMenuBuilder()
      .setCustomId(`trade_receive_${userTeamId}_${opponentTeamId}`)
      .setPlaceholder('Select players to receive (their team)')
      .setMinValues(1)
      .setMaxValues(Math.min(5, opponentPlayers.length))
      .addOptions(
        opponentPlayers.slice(0, 25).map(player => ({
          label: `${player.name} (${player.overall} OVR)`,
          value: player.id,
          description: `$${(player.salary / 1000000).toFixed(1)}M - ${player.position}`
        }))
      );
    
    const previewButton = new ButtonBuilder()
      .setCustomId(`trade_preview_${userTeamId}_${opponentTeamId}`)
      .setLabel('Preview Trade')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('👁️');
    
    const cancelButton = new ButtonBuilder()
      .setCustomId(`trade_cancel_${userTeamId}_${opponentTeamId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');
    
    const row1 = new ActionRowBuilder().addComponents(sendMenu);
    const row2 = new ActionRowBuilder().addComponents(receiveMenu);
    const row3 = new ActionRowBuilder().addComponents(previewButton, cancelButton);
    
    const userTeamName = await getTeamName(userTeamId);
    const opponentTeamName = await getTeamName(opponentTeamId);
    
    await interaction.editReply({
      content: `🔄 **PROPOSE TRADE - Step 3/4**\n\n**${userTeamName} ⇄ ${opponentTeamName}**\n\nSelect players from each team, then click **Preview Trade** to validate.`,
      components: [row1, row2, row3]
    });
    
    return;
  }
}

/**
 * Helper: Fetch players di un team
 */
async function getTeamPlayers(teamId) {
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  const playersSnapshot = await db.collection('players')
    .where('current_team', '==', teamId)
    .get();
  
  const players = [];
  const currentSeason = '2025-26';
  
  playersSnapshot.forEach(doc => {
    const player = doc.data();
    const contract = player.contract?.[currentSeason];
    
    if (contract && contract.salary > 0) {
      players.push({
        id: doc.id,
        name: player.name,
        salary: contract.salary,
        overall: player.overall || player.ovr || player.ratings?.overall || player.rating || 75,
        position: player.position || 'N/A',
        age: player.age || 25
      });
    }
  });
  
  // Sort by overall descending
  players.sort((a, b) => b.overall - a.overall);
  
  return players;
}

/**
 * Helper: Get team name
 */
async function getTeamName(teamId) {
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  const teamDoc = await db.collection('teams').doc(teamId).get();
  if (!teamDoc.exists) {
    return teamId;
  }
  
  return teamDoc.data().name || teamId;
}

/**
 * Handler per bottoni Preview/Submit/Cancel trade
 */
async function handleTradeButtons(interaction) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const { validateTrade } = require('../services/tradeValidationService');
  const { createTrade } = require('../services/tradeService');
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  const customId = interaction.customId;
  
  // === CANCEL ===
  if (customId === 'trade_cancel' || customId.startsWith('trade_cancel_')) {
    // Parse team IDs se presenti
    let userTeamId, opponentTeamId;
    if (customId.startsWith('trade_cancel_')) {
      const parts = customId.split('_');
      userTeamId = parts[2];
      opponentTeamId = parts[3];
      
      // Pulisci selezioni dalla Map
      const tradeKey = `${userTeamId}_${opponentTeamId}`;
      tradeSelections.delete(tradeKey);
      console.log(`🗑️ Cleaned trade selections for ${tradeKey}`);
    }
    
    await interaction.update({
      content: '❌ Trade proposal cancelled.',
      components: []
    });
    return;
  }
  
  // === PREVIEW ===
  if (customId.startsWith('trade_preview_')) {
    await interaction.deferUpdate();
    
    const parts = customId.split('_');
    const userTeamId = parts[2];
    const opponentTeamId = parts[3];
    const tradeKey = `${userTeamId}_${opponentTeamId}`;
    
    // Fetch selected players dalla Map
    const selections = tradeSelections.get(tradeKey);
    
    if (!selections || !selections.send || !selections.receive) {
      return interaction.followUp({
        content: '❌ No players selected. Please select players from both teams.',
        ephemeral: true
      });
    }
    
    const sendPlayerIds = selections.send;
    const receivePlayerIds = selections.receive;
    
    if (sendPlayerIds.length === 0 || receivePlayerIds.length === 0) {
      return interaction.followUp({
        content: '❌ You must select at least one player from each team.',
        ephemeral: true
      });
    }
    
    // Fetch player details
    const sendPlayers = await getPlayersByIds(sendPlayerIds);
    const receivePlayers = await getPlayersByIds(receivePlayerIds);
    
    // Calcola total salary
    const sendTotal = sendPlayers.reduce((sum, p) => sum + p.salary, 0);
    const receiveTotal = receivePlayers.reduce((sum, p) => sum + p.salary, 0);
    
    // Costruisci oggetto trade per validation
    const tradeData = {
      teams: [userTeamId, opponentTeamId],
      [`${userTeamId}_sends`]: {
        players: sendPlayers,
        total_salary: sendTotal,
        draft_picks: [],
        cash: 0
      },
      [`${userTeamId}_receives`]: {
        players: receivePlayers,
        total_salary: receiveTotal,
        draft_picks: []
      },
      [`${opponentTeamId}_sends`]: {
        players: receivePlayers,
        total_salary: receiveTotal,
        draft_picks: [],
        cash: 0
      },
      [`${opponentTeamId}_receives`]: {
        players: sendPlayers,
        total_salary: sendTotal,
        draft_picks: []
      }
    };
    
    // Valida trade
    const validation = await validateTrade(tradeData);
    
    // Crea embed preview
    const userTeamName = await getTeamName(userTeamId);
    const opponentTeamName = await getTeamName(opponentTeamId);
    
    const embed = new EmbedBuilder()
      .setTitle('🔄 TRADE PREVIEW - Step 4/4')
      .setDescription(`**${userTeamName} ⇄ ${opponentTeamName}**`)
      .setColor(validation.valid ? 0x00FF00 : 0xFF0000)
      .addFields(
        {
          name: `${userTeamName} Sends`,
          value: formatPlayerList(sendPlayers) + `\n**Total:** $${(sendTotal / 1000000).toFixed(1)}M`,
          inline: true
        },
        {
          name: `${userTeamName} Receives`,
          value: formatPlayerList(receivePlayers) + `\n**Total:** $${(receiveTotal / 1000000).toFixed(1)}M`,
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: false
        },
        {
          name: 'Validation Status',
          value: validation.valid ? '✅ All checks passed' : '❌ Validation failed',
          inline: false
        }
      );
    
    // Aggiungi validation details
    if (validation.checks && validation.checks.length > 0) {
      let checksText = '';
      validation.checks.forEach(check => {
        const emoji = check.passed ? '✅' : '❌';
        checksText += `${emoji} ${check.category}: ${check.message}\n`;
      });
      embed.addFields({
        name: 'Validation Details',
        value: checksText.substring(0, 1024)
      });
    }
    
    // Aggiungi red flags
    if (validation.redFlags && validation.redFlags.length > 0) {
      let flagsText = '';
      validation.redFlags.forEach(flag => {
        const emoji = flag.severity === 'high' ? '🔴' : flag.severity === 'medium' ? '🟡' : '🟢';
        flagsText += `${emoji} ${flag.message}\n`;
      });
      embed.addFields({
        name: '🚩 Red Flags',
        value: flagsText.substring(0, 1024)
      });
    }
    
    // Bottoni
    const submitButton = new ButtonBuilder()
      .setCustomId('trade_submit')
      .setLabel('Submit Trade')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(!validation.valid);
    
    const editButton = new ButtonBuilder()
      .setCustomId(`trade_select_opponent_${userTeamId}`)
      .setLabel('Edit Trade')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✏️');
    
    const cancelButton = new ButtonBuilder()
      .setCustomId(`trade_cancel_${userTeamId}_${opponentTeamId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');
    
    const row = new ActionRowBuilder().addComponents(submitButton, editButton, cancelButton);
    
    // Store trade data in message for submit
    await interaction.editReply({
      content: validation.valid 
        ? '✅ Trade is valid! You can submit it for approval.'
        : '❌ Trade validation failed. Please edit the trade to fix the issues.',
      embeds: [embed],
      components: [row]
    });
    
    return;
  }
  
  // === SUBMIT ===
  if (customId === 'trade_submit') {
    await interaction.deferUpdate();
    
    // Parse embed per estrarre trade data
    const embed = interaction.message.embeds[0];
    if (!embed) {
      return interaction.followUp({
        content: '❌ Cannot find trade data. Please try again.',
        ephemeral: true
      });
    }
    
    // Extract team names from description
    const description = embed.data.description;
    const teamMatch = description.match(/\*\*(.+?) ⇄ (.+?)\*\*/);
    
    if (!teamMatch) {
      return interaction.followUp({
        content: '❌ Cannot parse trade data. Please try again.',
        ephemeral: true
      });
    }
    
    // Get team IDs from channel name
    const channelName = interaction.channel.name;
    const teamIdMatch = channelName.match(/-([a-z]+)-hq$/);
    
    if (!teamIdMatch) {
      return interaction.followUp({
        content: '❌ Cannot determine your team.',
        ephemeral: true
      });
    }
    
    const userTeamId = teamIdMatch[1];
    
    // Extract player data from embed fields
    const sendField = embed.data.fields[0];
    const receiveField = embed.data.fields[1];
    
    // Parse players from field values
    const sendPlayerIds = await parsePlayersFromField(sendField.value);
    const receivePlayerIds = await parsePlayersFromField(receiveField.value);
    
    // Fetch full player data
    const sendPlayers = await getPlayersByIds(sendPlayerIds);
    const receivePlayers = await getPlayersByIds(receivePlayerIds);
    
    // Find opponent team ID (the other team in the trade)
    const teamsSnapshot = await db.collection('teams').get();
    let opponentTeamId = null;
    
    for (const doc of teamsSnapshot.docs) {
      if (doc.id === userTeamId) continue;
      
      const teamName = doc.data().name;
      if (teamMatch[2].includes(teamName) || teamMatch[1].includes(teamName)) {
        // Check if this team has the receive players
        const teamPlayers = await getTeamPlayers(doc.id);
        const hasPlayers = receivePlayerIds.every(id => 
          teamPlayers.some(p => p.id === id)
        );
        
        if (hasPlayers) {
          opponentTeamId = doc.id;
          break;
        }
      }
    }
    
    if (!opponentTeamId) {
      return interaction.followUp({
        content: '❌ Cannot determine opponent team. Please try again.',
        ephemeral: true
      });
    }
    
    // Calcola total salary
    const sendTotal = sendPlayers.reduce((sum, p) => sum + p.salary, 0);
    const receiveTotal = receivePlayers.reduce((sum, p) => sum + p.salary, 0);
    
    // Costruisci trade data
    const tradeData = {
      teams: [userTeamId, opponentTeamId],
      tradeDetails: {
        [`${userTeamId}_sends`]: {
          players: sendPlayers,
          total_salary: sendTotal,
          draft_picks: [],
          cash: 0
        },
        [`${userTeamId}_receives`]: {
          players: receivePlayers,
          total_salary: receiveTotal,
          draft_picks: []
        },
        [`${opponentTeamId}_sends`]: {
          players: receivePlayers,
          total_salary: receiveTotal,
          draft_picks: [],
          cash: 0
        },
        [`${opponentTeamId}_receives`]: {
          players: sendPlayers,
          total_salary: sendTotal,
          draft_picks: []
        }
      }
    };
    
    // Crea trade
    const result = await createTrade(interaction.user.id, tradeData);
    
    if (!result.success) {
      return interaction.followUp({
        content: `❌ Failed to create trade: ${result.error}`,
        ephemeral: true
      });
    }
    
    // Invia notifica al team opponent
    const { sendTradeNotification } = require('../services/tradeService');
    const notificationResult = await sendTradeNotification(
      interaction.client, 
      result.trade, 
      userTeamId
    );
    
    // Success!
    const userTeamName = await getTeamName(userTeamId);
    const opponentTeamName = await getTeamName(opponentTeamId);
    
    let confirmMessage = `✅ **TRADE PROPOSED!**\n\n**Trade #${result.trade.number}:** ${userTeamName} ⇄ ${opponentTeamName}\n\n`;
    
    if (notificationResult.success) {
      confirmMessage += `📤 **Notification sent to ${opponentTeamName}!**\n\n` +
        `The other GM has been notified and can now accept or decline the trade.\n\n`;
    } else {
      confirmMessage += `⚠️ **Trade created but notification failed.**\n` +
        `Error: ${notificationResult.error}\n\n`;
    }
    
    confirmMessage += `**Status:** ${result.trade.status}\n` +
      `**Trade ID:** \`${result.trade.id}\`\n\n` +
      `Once the other GM accepts, the trade will be sent to the commissioner for approval.`;
    
    await interaction.editReply({
      content: confirmMessage,
      embeds: [],
      components: []
    });
    
    // Pulisci selezioni dalla Map
    const tradeKey = `${userTeamId}_${opponentTeamId}`;
    tradeSelections.delete(tradeKey);
    console.log(`🗑️ Cleaned trade selections for ${tradeKey}`);
    
    return;
  }
}

/**
 * Handler per bottoni Accept/Decline trade (GM response)
 */
async function handleTradeResponseButtons(interaction) {
  const { acceptTrade, rejectTrade } = require('../services/tradeService');
  const { EmbedBuilder } = require('discord.js');
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  const customId = interaction.customId;
  // CustomId format: trade_accept_TRADEID_TEAMID o trade_decline_TRADEID_TEAMID
  // Problema: TRADEID può contenere underscore (es. "trade_4")
  // quindi non possiamo fare un semplice split('_')
  
  const parts = customId.split('_');
  const action = parts[1]; // 'accept' o 'decline'
  
  // Tutto dopo "trade_action_" è "TRADEID_TEAMID"
  // Es: "trade_accept_trade_4_bulls" -> remainder = "trade_4_bulls"
  const remainder = parts.slice(2).join('_');
  
  // L'ultimo elemento dopo l'ultimo underscore è teamId
  const lastUnderscoreIndex = remainder.lastIndexOf('_');
  const tradeId = remainder.substring(0, lastUnderscoreIndex); // "trade_4"
  const teamId = remainder.substring(lastUnderscoreIndex + 1); // "bulls"
  
  await interaction.deferUpdate();
  
  try {
    // Permission check: verifica che l'utente sia nel canale corretto
    // In TESTING_MODE questo check è più permissivo per permettere testing singolo
    const channelName = interaction.channel.name;
    const channelTeamMatch = channelName.match(/-([a-z]+)-hq$/);
    
    // Verifica almeno che sia in un canale HQ
    if (!channelTeamMatch) {
      return interaction.followUp({
        content: '❌ You can only respond to trades in team HQ channels.',
        ephemeral: true
      });
    }
    
    // In production mode, verifica che l'utente sia nel canale del team corretto
    // In testing mode, permetti qualsiasi canale HQ (per test da singolo utente)
    const TESTING_MODE = process.env.TESTING_MODE === 'true';
    
    if (!TESTING_MODE && channelTeamMatch[1] !== teamId) {
      return interaction.followUp({
        content: '❌ You can only respond to trades in your own team HQ channel.',
        ephemeral: true
      });
    }
    
    if (TESTING_MODE) {
      console.log(`🧪 TESTING MODE: User responding to trade ${tradeId} for team ${teamId} in channel ${channelName}`);
    }
    
    // Fetch trade data
    const tradeDoc = await db.collection('trades').doc(tradeId).get();
    
    if (!tradeDoc.exists) {
      return interaction.followUp({
        content: '❌ Trade not found.',
        ephemeral: true
      });
    }
    
    const trade = tradeDoc.data();
    
    // Fetch team names
    const team1Doc = await db.collection('teams').doc(trade.teams[0]).get();
    const team2Doc = await db.collection('teams').doc(trade.teams[1]).get();
    const team1Name = team1Doc.data().name;
    const team2Name = team2Doc.data().name;
    
    if (action === 'accept') {
      // Accept trade
      const result = await acceptTrade(tradeId, interaction.user.id, teamId, interaction.client);
      
      if (!result.success) {
        return interaction.followUp({
          content: `❌ Failed to accept trade: ${result.error}`,
          ephemeral: true
        });
      }
      
      // Update notification message
      const embed = new EmbedBuilder()
        .setTitle('✅ TRADE ACCEPTED')
        .setDescription(`**${team1Name} ⇄ ${team2Name}**`)
        .setColor(0x00FF00)
        .addFields(
          {
            name: 'Status',
            value: result.needsCommissionerApproval 
              ? '✅ Both GMs accepted - Sent to commissioner for approval' 
              : '⏳ Waiting for other GM to accept',
            inline: false
          },
          {
            name: 'Trade ID',
            value: `\`${tradeId}\``,
            inline: true
          }
        )
        .setTimestamp();
      
      await interaction.editReply({
        content: result.needsCommissionerApproval 
          ? '✅ **Trade fully accepted!** The commissioner will now review it.'
          : '✅ **You accepted the trade!** Waiting for the other GM.',
        embeds: [embed],
        components: [] // Remove buttons
      });
      
      // Se entrambi hanno accettato, notifica in un canale pubblico (opzionale)
      if (result.needsCommissionerApproval) {
        console.log(`✅ Trade ${tradeId} ready for commissioner approval`);
      }
      
    } else if (action === 'decline') {
      // Decline trade
      const result = await rejectTrade(tradeId, interaction.user.id, teamId, 'GM declined');
      
      if (!result.success) {
        return interaction.followUp({
          content: `❌ Failed to decline trade: ${result.error}`,
          ephemeral: true
        });
      }
      
      // Update notification message
      const embed = new EmbedBuilder()
        .setTitle('❌ TRADE DECLINED')
        .setDescription(`**${team1Name} ⇄ ${team2Name}**`)
        .setColor(0xFF0000)
        .addFields(
          {
            name: 'Status',
            value: '❌ Trade has been declined and cancelled',
            inline: false
          },
          {
            name: 'Trade ID',
            value: `\`${tradeId}\``,
            inline: true
          }
        )
        .setTimestamp();
      
      await interaction.editReply({
        content: '❌ **Trade declined.** The trade proposal has been cancelled.',
        embeds: [embed],
        components: [] // Remove buttons
      });
      
      console.log(`❌ Trade ${tradeId} declined by ${teamId}`);
    }
    
  } catch (error) {
    console.error('❌ Error handling trade response:', error);
    return interaction.followUp({
      content: '❌ An error occurred while processing your response.',
      ephemeral: true
    });
  }
}

/**
 * Helper: Get players by IDs
 */
async function getPlayersByIds(playerIds) {
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  const players = [];
  const currentSeason = '2025-26';
  
  for (const playerId of playerIds) {
    const playerDoc = await db.collection('players').doc(playerId).get();
    
    if (playerDoc.exists) {
      const player = playerDoc.data();
      const contract = player.contract?.[currentSeason];
      
      players.push({
        id: playerDoc.id,
        name: player.name,
        salary: contract?.salary || 0,
        overall: player.ratings?.overall || 75,
        age: player.age || 25,
        position: player.position || 'N/A'
      });
    }
  }
  
  return players;
}

/**
 * Helper: Parse player IDs from embed field value
 */
async function parsePlayersFromField(fieldValue) {
  const { getDatabase } = require('../database/firebase');
  const db = getDatabase();
  
  // Field format: "• LeBron James (90 OVR, $48.7M)\n..."
  const lines = fieldValue.split('\n').filter(line => line.startsWith('•'));
  
  const playerIds = [];
  
  for (const line of lines) {
    // Extract player name
    const nameMatch = line.match(/• (.+?) \(/);
    if (!nameMatch) continue;
    
    const playerName = nameMatch[1];
    
    // Search player by name
    const playersSnapshot = await db.collection('players')
      .where('name', '==', playerName)
      .limit(1)
      .get();
    
    if (!playersSnapshot.empty) {
      playerIds.push(playersSnapshot.docs[0].id);
    }
  }
  
  return playerIds;
}

/**
 * Helper: Format player list for display
 */
function formatPlayerList(players) {
  if (!players || players.length === 0) {
    return 'None';
  }
  
  return players.map(p => {
    return `• ${p.name} (${p.overall} OVR, $${(p.salary / 1000000).toFixed(1)}M)`;
  }).join('\n');
}