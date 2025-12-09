// ═══════════════════════════════════════════════════════
// READY EVENT - Bot startup
// ═══════════════════════════════════════════════════════

const { Events } = require('discord.js');
const { startFATimerChecker } = require('../services/faTimerService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guild(s)`);
    console.log(`👥 Watching ${client.users.cache.size} user(s)`);
    
    // START FA TIMER CHECKER
    try {
      startFATimerChecker(client);
      console.log('⏰ FA Timer checker started (checks every 5 minutes)');
    } catch (error) {
      console.error('❌ Failed to start FA Timer:', error);
    }
    
    console.log('🚀 Bot is ready!');
  },
};