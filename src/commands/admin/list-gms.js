// ═══════════════════════════════════════════════════════
// LIST GMS COMMAND - List all GMs or specific team
// Shows GM and Co-GMs for teams
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { getTeamGMs, getAllGMs, NBA_TEAMS } = require('../../services/gmManagementService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list-gms')
    .setDescription('List GMs and Co-GMs')
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Specific team (optional - leave blank for all teams)')
        .setRequired(false)
        .setAutocomplete(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const choices = NBA_TEAMS.map(t => t.name);
    const filtered = choices.filter(choice => 
      choice.toLowerCase().includes(focusedValue)
    );
    
    await interaction.respond(
      filtered.slice(0, 25).map(choice => ({ 
        name: choice, 
        value: choice 
      }))
    );
  },
  
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const teamName = interaction.options.getString('team');
    
    try {
      if (teamName) {
        // Show specific team
        await showTeamGMs(interaction, teamName);
      } else {
        // Show all teams
        await showAllGMs(interaction);
      }
      
    } catch (error) {
      console.error('Error in list-gms command:', error);
      await interaction.editReply({
        content: `❌ **Error:** ${error.message}`
      });
    }
  }
};

async function showTeamGMs(interaction, teamName) {
  // Find team
  const team = NBA_TEAMS.find(t => t.name === teamName);
  
  if (!team) {
    return interaction.editReply({
      content: `❌ **Team not found:** ${teamName}`
    });
  }
  
  // Get GMs
  const teamGMs = await getTeamGMs(team.id);
  
  if (!teamGMs) {
    return interaction.editReply({
      content: `❌ **Team data not found for:** ${teamName}`
    });
  }
  
  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`👥 ${teamGMs.teamName} - GM ROSTER`)
    .setTimestamp();
  
  // Main GM
  if (teamGMs.gm.id) {
    embed.addFields({
      name: '👑 General Manager',
      value: `<@${teamGMs.gm.id}> (${teamGMs.gm.name})`,
      inline: false
    });
  } else {
    embed.addFields({
      name: '👑 General Manager',
      value: '❌ No GM assigned',
      inline: false
    });
  }
  
  // Co-GMs
  if (teamGMs.coGMs.length > 0) {
    const coGMsList = teamGMs.coGMs.map(id => `<@${id}>`).join('\n');
    embed.addFields({
      name: `🤝 Co-GMs (${teamGMs.coGMs.length})`,
      value: coGMsList,
      inline: false
    });
  } else {
    embed.addFields({
      name: '🤝 Co-GMs',
      value: 'None',
      inline: false
    });
  }
  
  await interaction.editReply({
    embeds: [embed]
  });
}

async function showAllGMs(interaction) {
  // Get all GMs
  const allGMs = await getAllGMs();
  
  // Count stats
  const teamsWithGM = allGMs.filter(t => t.gm.id !== null).length;
  const teamsWithoutGM = allGMs.filter(t => t.gm.id === null).length;
  const totalCoGMs = allGMs.reduce((sum, t) => sum + t.coGMs.length, 0);
  
  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('👥 NBA FANTASY LEAGUE - GM ROSTER')
    .setDescription(
      `**Teams with GM:** ${teamsWithGM}/30\n` +
      `**Teams without GM:** ${teamsWithoutGM}/30\n` +
      `**Total Co-GMs:** ${totalCoGMs}`
    )
    .setTimestamp();
  
  // Group teams by conference (or just list all)
  let teamsList = '';
  
  allGMs.sort((a, b) => a.teamName.localeCompare(b.teamName));
  
  for (const team of allGMs.slice(0, 20)) { // First 20 to avoid embed limit
    let teamLine = `**${team.teamName}**\n`;
    
    if (team.gm.id) {
      teamLine += `  👑 <@${team.gm.id}>`;
    } else {
      teamLine += `  ❌ No GM`;
    }
    
    if (team.coGMs.length > 0) {
      teamLine += ` • ${team.coGMs.length} Co-GM(s)`;
    }
    
    teamsList += teamLine + '\n\n';
  }
  
  if (teamsList) {
    embed.addFields({
      name: '🏀 Teams (1-20)',
      value: teamsList
    });
  }
  
  // If more than 20 teams, add second field
  if (allGMs.length > 20) {
    let teamsList2 = '';
    
    for (const team of allGMs.slice(20, 30)) {
      let teamLine = `**${team.teamName}**\n`;
      
      if (team.gm.id) {
        teamLine += `  👑 <@${team.gm.id}>`;
      } else {
        teamLine += `  ❌ No GM`;
      }
      
      if (team.coGMs.length > 0) {
        teamLine += ` • ${team.coGMs.length} Co-GM(s)`;
      }
      
      teamsList2 += teamLine + '\n\n';
    }
    
    if (teamsList2) {
      embed.addFields({
        name: '🏀 Teams (21-30)',
        value: teamsList2
      });
    }
  }
  
  embed.setFooter({ text: 'Use /list-gms team:[name] for details' });
  
  await interaction.editReply({
    embeds: [embed]
  });
}