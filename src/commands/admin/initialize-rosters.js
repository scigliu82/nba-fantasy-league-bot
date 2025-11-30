// ═══════════════════════════════════════════════════════
// INITIALIZE ROSTERS - Post roster messages in team channels
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { collections } = require('../../database/firebase');
const { generateRosterMessage } = require('../../services/rosterDisplayService');

// Team emoji mapping
const TEAM_EMOJI = {
  hawks: '🔴', celtics: '🟢', nets: '⚫', hornets: '🐝', bulls: '🔴',
  cavaliers: '🍷', mavericks: '🐴', nuggets: '⛰️', pistons: '🔵', warriors: '🔵',
  rockets: '🚀', pacers: '🟡', clippers: '🔴', lakers: '💜', grizzlies: '🐻',
  heat: '🔥', bucks: '🟢', timberwolves: '🐺', pelicans: '🦅', knicks: '🔵',
  thunder: '⚡', magic: '⭐', sixers: '🔴', suns: '🌞', blazers: '🔴',
  kings: '👑', spurs: '⚫', raptors: '🔴', jazz: '🎵', wizards: '🔵'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('initialize-rosters')
    .setDescription('Post roster messages in all team HQ channels (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const guild = interaction.guild;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      // Get all teams from database
      const teamsSnapshot = await collections.teams().get();
      const teams = [];
      
      teamsSnapshot.forEach(doc => {
        teams.push({ id: doc.id, ...doc.data() });
      });

      if (teams.length === 0) {
        return await interaction.editReply('❌ No teams found in database. Run roster import first!');
      }

      await interaction.editReply(`🚀 Initializing rosters for ${teams.length} teams...\n⏳ This may take a minute...`);

      // Process each team
      for (const team of teams) {
        try {
          // Find team channel
          const emoji = TEAM_EMOJI[team.id] || '🏀';
          const channelName = `${emoji}-${team.id}-hq`;
          
          const channel = guild.channels.cache.find(ch => ch.name === channelName);

          if (!channel) {
            errors.push(`❌ Channel not found: ${channelName}`);
            errorCount++;
            continue;
          }

          // Generate roster message
          const rosterMessage = await generateRosterMessage(team.id);

          // Check if roster message already exists
          const teamDoc = await collections.teams().doc(team.id).get();
          const teamData = teamDoc.data();
          
          if (teamData?.discord?.roster_message_id) {
            // Try to fetch and update existing message
            try {
              const existingMessage = await channel.messages.fetch(teamData.discord.roster_message_id);
              await existingMessage.edit(rosterMessage);
              successCount++;
              continue;
            } catch (err) {
              // Message not found, create new one
              console.log(`Previous message not found for ${team.id}, creating new one`);
            }
          }

          // Post new message
          const message = await channel.send(rosterMessage);

          // Save message ID to database
          await collections.teams().doc(team.id).update({
            discord: {
              channel_id: channel.id,
              roster_message_id: message.id,
              last_updated: new Date().toISOString()
            }
          });

          successCount++;

        } catch (error) {
          console.error(`Error posting roster for ${team.id}:`, error);
          errors.push(`❌ ${team.name}: ${error.message}`);
          errorCount++;
        }
      }

      // Build result message
      let resultMessage = '═══════════════════════════════════════════════════════\n';
      resultMessage += '✅ ROSTER INITIALIZATION COMPLETE!\n';
      resultMessage += '═══════════════════════════════════════════════════════\n\n';
      resultMessage += `📊 **Results:**\n`;
      resultMessage += `✅ Success: ${successCount} teams\n`;
      
      if (errorCount > 0) {
        resultMessage += `❌ Errors: ${errorCount} teams\n\n`;
        resultMessage += `**Errors:**\n`;
        resultMessage += errors.slice(0, 10).join('\n');
        
        if (errors.length > 10) {
          resultMessage += `\n... and ${errors.length - 10} more errors`;
        }
      }

      await interaction.editReply(resultMessage);

    } catch (error) {
      console.error('Error initializing rosters:', error);
      await interaction.editReply(`❌ **Fatal error during initialization:**\n\`\`\`${error.message}\`\`\``);
    }
  },
};