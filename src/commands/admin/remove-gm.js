// ═══════════════════════════════════════════════════════
// REMOVE GM COMMAND - Remove GM or Co-GM from team
// Admin only - Removes role, updates DB
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { removeGM, NBA_TEAMS, getTeamGMs } = require('../../services/gmManagementService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-gm')
    .setDescription('Remove GM or Co-GM from a team (Admin only)')
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Team name')
        .setRequired(true)
        .setAutocomplete(true))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to remove')
        .setRequired(true))
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
    const user = interaction.options.getUser('user');
    
    // Find team
    const team = NBA_TEAMS.find(t => t.name === teamName);
    
    if (!team) {
      return interaction.editReply({
        content: `❌ **Team not found:** ${teamName}`
      });
    }
    
    try {
      // Check if user is actually GM/Co-GM of this team
      const teamGMs = await getTeamGMs(team.id);
      
      const isGM = teamGMs.gm.id === user.id;
      const isCoGM = teamGMs.coGMs.includes(user.id);
      
      if (!isGM && !isCoGM) {
        return interaction.editReply({
          content: `❌ **${user.tag} is not a GM or Co-GM of ${team.name}**`
        });
      }
      
      const roleType = isGM ? 'GM' : 'Co-GM';
      
      // Remove GM
      const result = await removeGM(
        interaction.guild,
        team.id,
        user
      );
      
      if (!result.success) {
        return interaction.editReply({
          content: `❌ **Error removing GM:**\n${result.error}`
        });
      }
      
      // Success embed
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('🔓 GM REMOVED')
        .setDescription(
          `**${user.tag}** has been removed as **${roleType}** of the **${team.name}**`
        )
        .addFields(
          { name: '👤 User', value: `<@${user.id}>`, inline: true },
          { name: '🏀 Team', value: team.name, inline: true },
          { name: '🎭 Was', value: roleType, inline: true }
        )
        .addFields({
          name: '✅ Changes Applied',
          value: 
            `• Discord role removed\n` +
            `• Database updated\n` +
            `• User can no longer see team HQ channel\n` +
            `• Team commands disabled for this user`
        })
        .setFooter({ text: `Admin: ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({
        embeds: [embed]
      });
      
      // Send DM to user
      try {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF9900)
              .setTitle('📢 Team Assignment Removed')
              .setDescription(
                `You have been removed as **${roleType}** of the **${team.name}**.\n\n` +
                `You no longer have access to the team HQ channel or team commands.`
              )
          ]
        });
      } catch (err) {
        console.log(`Could not DM ${user.tag}`);
      }
      
      console.log(`✅ ${interaction.user.tag} removed ${user.tag} from ${team.name}`);
      
    } catch (error) {
      console.error('Error in remove-gm command:', error);
      await interaction.editReply({
        content: `❌ **Error:** ${error.message}`
      });
    }
  }
};