// ═══════════════════════════════════════════════════════
// SETUP TEAM ROLES COMMAND - One-time setup
// Creates all 30 team roles and sets channel permissions
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { setupAllTeamRoles } = require('../../services/gmManagementService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-team-roles')
    .setDescription('Setup all 30 team roles and permissions (Admin only - one-time setup)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    await interaction.editReply({
      content: '🎛️ Setting up team roles and permissions...\nThis may take 1-2 minutes.'
    });
    
    try {
      // Setup all roles
      const results = await setupAllTeamRoles(interaction.guild);
      
      // Build result embed
      const embed = new EmbedBuilder()
        .setColor(results.errors.length === 0 ? 0x00FF00 : 0xFFAA00)
        .setTitle('🎛️ TEAM ROLES SETUP COMPLETE')
        .setDescription(
          `**Results:**\n` +
          `✅ Success: ${results.success.length}/30 teams\n` +
          `🔄 Existing roles used: ${results.existing?.length || 0}/30\n` +
          `❌ Errors: ${results.errors.length}/30 teams`
        )
        .setTimestamp();
      
      // Note about existing roles
      if (results.existing && results.existing.length > 0) {
        embed.addFields({
          name: '📝 Note',
          value: `Found ${results.existing.length} existing GM roles from \`/setup server\` command. Using those instead of creating duplicates.`,
          inline: false
        });
      }
      
      // List successful teams
      if (results.success.length > 0) {
        const successList = results.success.slice(0, 15).join(', ');
        let successField = successList;
        
        if (results.success.length > 15) {
          successField += `\n... and ${results.success.length - 15} more`;
        }
        
        embed.addFields({
          name: '✅ Successful Setup',
          value: successField,
          inline: false
        });
      }
      
      // List errors
      if (results.errors.length > 0) {
        const errorList = results.errors
          .slice(0, 10)
          .map(e => `• ${e.team}: ${e.error}`)
          .join('\n');
        
        let errorField = errorList;
        
        if (results.errors.length > 10) {
          errorField += `\n... and ${results.errors.length - 10} more errors`;
        }
        
        embed.addFields({
          name: '❌ Errors',
          value: errorField,
          inline: false
        });
      }
      
      // Add instructions
      embed.addFields({
        name: '📝 Next Steps',
        value: 
          `1. Use \`/assign-gm\` to assign GMs to teams\n` +
          `2. Use \`/list-gms\` to view current assignments\n` +
          `3. Use \`/remove-gm\` to remove GMs if needed\n\n` +
          `✅ All team roles have been created\n` +
          `✅ Channel permissions have been set\n` +
          `✅ Teams are ready for GM assignment!`
      });
      
      await interaction.editReply({
        content: null,
        embeds: [embed]
      });
      
      console.log(`✅ ${interaction.user.tag} completed team roles setup: ${results.success.length}/30 success`);
      
    } catch (error) {
      console.error('Error in setup-team-roles command:', error);
      await interaction.editReply({
        content: `❌ **Error during setup:**\n${error.message}\n\nCheck console for details.`
      });
    }
  }
};