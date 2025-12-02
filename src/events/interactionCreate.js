// ═══════════════════════════════════════════════════════
// INTERACTION CREATE EVENT - Handle slash commands, autocomplete & buttons
// ═══════════════════════════════════════════════════════

const { Events } = require('discord.js');
const admin = require('firebase-admin');

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
      return;
    }
  },
};

/**
 * Handler per i bottoni del Control Panel
 * @param {Interaction} interaction - Discord button interaction
 */
async function handleControlPanelButton(interaction) {
  const db = admin.firestore();
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
  
  // === BOTTONI DISABILITATI (Coming Soon) ===
  
  // Tutti gli altri bottoni mostrano "Coming Soon"
  await interaction.reply({
    content: '🚧 **This feature is coming soon!**\n\nWe\'re working on implementing this functionality.',
    ephemeral: true
  });
}