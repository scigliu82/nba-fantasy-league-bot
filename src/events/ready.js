// ═══════════════════════════════════════════════════════
// READY EVENT - Bot successfully connected to Discord
// ═══════════════════════════════════════════════════════

const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  
  async execute(client) {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Bot ready! Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
    console.log(`👥 ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)} total users`);
    console.log('═══════════════════════════════════════════════════════');

    // Set bot status
    client.user.setPresence({
      activities: [{
        name: 'NBA Fantasy League | /help',
        type: ActivityType.Playing
      }],
      status: 'online'
    });

    // Log available commands
    console.log(`\n📋 Loaded ${client.commands.size} commands:`);
    client.commands.forEach(command => {
      console.log(`   • /${command.data.name}`);
    });
    console.log('');
  },
};