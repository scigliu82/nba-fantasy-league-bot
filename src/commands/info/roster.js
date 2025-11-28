// ═══════════════════════════════════════════════════════
// ROSTER COMMAND - View team roster
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { collections } = require('../../database/firebase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription('View a team roster')
    .addStringOption(option =>
      option
        .setName('team')
        .setDescription('Team to view (leave empty for your team)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      let teamId = interaction.options.getString('team');

      // If no team specified, get user's team
      if (!teamId) {
        teamId = await getUserTeam(interaction.user.id);
        if (!teamId) {
          return interaction.editReply({
            content: '❌ You are not assigned to any team. Please specify a team name.',
            ephemeral: true
          });
        }
      }

      // Normalize team ID (lowercase, remove spaces)
      teamId = teamId.toLowerCase().replace(/\s+/g, '_');

      // Get team data
      const teamDoc = await collections.teams().doc(teamId).get();
      
      if (!teamDoc.exists) {
        return interaction.editReply({
          content: `❌ Team "${teamId}" not found. Please check the team name.`,
          ephemeral: true
        });
      }

      const team = { id: teamDoc.id, ...teamDoc.data() };

      // Get players
      const playersSnapshot = await collections.players()
        .where('current_team', '==', teamId)
        .where('contract_type', '==', 'standard')
        .get();

      const twoWaySnapshot = await collections.players()
        .where('current_team', '==', teamId)
        .where('contract_type', '==', 'two_way')
        .get();

      const players = playersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const twoWayPlayers = twoWaySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort players by OVR (descending)
      players.sort((a, b) => b.overall - a.overall);
      twoWayPlayers.sort((a, b) => b.overall - a.overall);

      // Create embed
      const embed = new EmbedBuilder()
        .setColor('#1D428A') // NBA blue
        .setTitle(`🏀 ${team.name} - ROSTER`)
        .setDescription(`${team.city} | ${team.conference} Conference | ${team.division} Division`)
        .setTimestamp();

      // Add GM info
      if (team.gm && team.gm.username) {
        embed.addFields({
          name: '👤 General Manager',
          value: `${team.gm.username}`,
          inline: true
        });
      }

      // Add record
      if (team.record) {
        embed.addFields({
          name: '📊 Record',
          value: `${team.record.wins}-${team.record.losses} (.${Math.round(team.record.win_pct * 1000)})`,
          inline: true
        });
      }

      // Format standard roster
      let rosterText = '';
      
      if (players.length === 0) {
        rosterText = '*No players*';
      } else {
        for (const player of players) {
          const salary = player.contract?.[getCurrentSeason()]?.salary || 0;
          const salaryStr = formatCurrency(salary);
          
          rosterText += `**${player.name}** (${player.position}, ${player.age})\n`;
          rosterText += `OVR: ${player.overall} | ${salaryStr}\n\n`;
        }
      }

      embed.addFields({
        name: `📋 STANDARD ROSTER (${players.length}/15)`,
        value: rosterText.slice(0, 1024) // Discord field limit
      });

      // Two-way contracts
      if (twoWayPlayers.length > 0) {
        let twoWayText = '';
        for (const player of twoWayPlayers) {
          twoWayText += `**${player.name}** (${player.position}, ${player.age}) - OVR ${player.overall}\n`;
        }
        
        embed.addFields({
          name: `🔄 TWO-WAY CONTRACTS (${twoWayPlayers.length}/2)`,
          value: twoWayText
        });
      }

      // Salary cap info
      const salary = team.salary?.[getCurrentSeason()];
      if (salary) {
        let capText = `Total: ${formatCurrency(salary.total_cap_hit)}\n`;
        capText += `Status: ${getCapStatus(salary)}\n`;
        
        if (salary.luxury_tax && salary.luxury_tax > 0) {
          capText += `Tax: ${formatCurrency(salary.luxury_tax)}`;
        }

        embed.addFields({
          name: '💰 SALARY CAP',
          value: capText
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error executing roster command:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching the roster.',
        ephemeral: true
      });
    }
  },
};

// ───────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ───────────────────────────────────────────────────────

async function getUserTeam(userId) {
  try {
    // Query teams where gm.discord_id matches userId
    const teamsSnapshot = await collections.teams()
      .where('gm.discord_id', '==', userId)
      .limit(1)
      .get();

    if (teamsSnapshot.empty) {
      return null;
    }

    return teamsSnapshot.docs[0].id;
  } catch (error) {
    console.error('Error getting user team:', error);
    return null;
  }
}

function getCurrentSeason() {
  return process.env.CURRENT_SEASON || '2025-26';
}

function formatCurrency(amount) {
  if (!amount || amount === 0) return '$0';
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  
  return `$${amount.toLocaleString()}`;
}

function getCapStatus(salary) {
  const cap = parseInt(process.env.SALARY_CAP);
  const firstApron = parseInt(process.env.FIRST_APRON);
  const secondApron = parseInt(process.env.SECOND_APRON);
  const total = salary.total_cap_hit;

  if (total < cap) {
    return `✅ Under Cap ($${((cap - total) / 1000000).toFixed(1)}M space)`;
  } else if (total < firstApron) {
    return `🟡 Over Cap, Under First Apron`;
  } else if (total < secondApron) {
    return `🟠 Over First Apron`;
  } else {
    return `🔴 Over Second Apron`;
  }
}