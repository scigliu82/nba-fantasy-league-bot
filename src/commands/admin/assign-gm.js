// ═══════════════════════════════════════════════════════
// ASSIGN GM COMMAND - Assign GM or Co-GM to team
// Admin only - Creates role, assigns user, updates DB
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { assignGM, NBA_TEAMS } = require('../../services/gmManagementService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('assign-gm')
    .setDescription('Assign GM or Co-GM to a team (Admin only)')
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Team name')
        .setRequired(true)
        .setAutocomplete(true))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to assign')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('role')
        .setDescription('Role type')
        .setRequired(true)
        .addChoices(
          { name: 'GM (Main)', value: 'GM' },
          { name: 'Co-GM', value: 'Co-GM' }
        ))
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
    const roleType = interaction.options.getString('role');
    
    // Find team
    const team = NBA_TEAMS.find(t => t.name === teamName);
    
    if (!team) {
      return interaction.editReply({
        content: `❌ **Team not found:** ${teamName}`
      });
    }
    
    try {
      // Assign GM
      const result = await assignGM(
        interaction.guild,
        team.id,
        team.name,
        user,
        roleType
      );
      
      if (!result.success) {
        return interaction.editReply({
          content: `❌ **Error assigning GM:**\n${result.error}`
        });
      }
      
      // Success embed
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ GM ASSIGNED')
        .setDescription(
          `**${user.tag}** has been assigned as **${roleType}** of the **${team.name}**!`
        )
        .addFields(
          { name: '👤 User', value: `<@${user.id}>`, inline: true },
          { name: '🏀 Team', value: team.name, inline: true },
          { name: '🎭 Role', value: roleType, inline: true }
        )
        .addFields({
          name: '✅ Changes Applied',
          value: 
            `• Discord role **@${result.role.name}** assigned\n` +
            `• Database updated\n` +
            `• Channel permissions set\n` +
            `• User can now see team HQ channel`
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
              .setColor(0x1D428A)
              .setTitle('🎉 You have been assigned to a team!')
              .setDescription(
                `You are now the **${roleType}** of the **${team.name}**!\n\n` +
                `You can now:\n` +
                `• Access your team HQ channel\n` +
                `• Use team commands (\`/fa-offer\`, \`/propose-trade\`, etc.)\n` +
                `• Manage your roster and cap space\n\n` +
                `Good luck! 🏀`
              )
          ]
        });
      } catch (err) {
        console.log(`Could not DM ${user.tag}`);
      }
      
      console.log(`✅ ${interaction.user.tag} assigned ${user.tag} as ${roleType} of ${team.name}`);
      
    } catch (error) {
      console.error('Error in assign-gm command:', error);
      await interaction.editReply({
        content: `❌ **Error:** ${error.message}`
      });
    }
  }
};