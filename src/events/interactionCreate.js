// ═══════════════════════════════════════════════════════
// INTERACTION CREATE EVENT - Handle slash commands
// ═══════════════════════════════════════════════════════

const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  
  async execute(interaction) {
    // Only handle slash commands
    if (!interaction.isChatInputCommand()) return;

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
  },
};