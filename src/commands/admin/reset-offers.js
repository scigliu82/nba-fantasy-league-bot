// ═══════════════════════════════════════════════════════
// RESET OFFERS COMMAND - Admin command to reset all pending offers
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-offers')
    .setDescription('Reset all pending FA offers and unlock cap space (Admin only)')
    .addStringOption(option =>
      option.setName('password')
        .setDescription('Admin password (RESET_CONFIRM)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const password = interaction.options.getString('password');
    
    // Check password
    if (password !== 'RESET_CONFIRM') {
      return interaction.editReply({
        content: `❌ **Invalid Password**\n\nUse password: \`RESET_CONFIRM\` to confirm reset.\n\n⚠️ This will delete all pending offers!`
      });
    }
    
    try {
      const db = admin.firestore();
      
      // Get all pending offers
      const snapshot = await db.collection('fa_offers')
        .where('status', '==', 'pending')
        .get();
      
      if (snapshot.empty) {
        return interaction.editReply({
          content: '✅ No pending offers to reset.'
        });
      }
      
      const offersToReset = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log(`[RESET-OFFERS] Resetting ${offersToReset.length} pending offers...`);
      
      // Group by player for status reset
      const playersBySeasonId = {};
      
      for (const offer of offersToReset) {
        const key = `${offer.season}_${offer.player_id}`;
        if (!playersBySeasonId[key]) {
          playersBySeasonId[key] = {
            season: offer.season,
            player_id: offer.player_id,
            player_name: offer.player_name,
            offers: []
          };
        }
        playersBySeasonId[key].offers.push(offer);
      }
      
      let deletedOffers = 0;
      let playersReset = 0;
      
      // Delete all pending offers
      const batch = db.batch();
      
      for (const offer of offersToReset) {
        const offerRef = db.collection('fa_offers').doc(offer.id);
        batch.delete(offerRef);
        deletedOffers++;
      }
      
      await batch.commit();
      
      console.log(`[RESET-OFFERS] Deleted ${deletedOffers} offers`);
      
      // Reset player status and current_offers
      for (const [key, playerData] of Object.entries(playersBySeasonId)) {
        try {
          const faDoc = db.collection('free_agents').doc(`fa_${playerData.season}`);
          
          await faDoc.update({
            [`players.${playerData.player_id}.current_offers`]: [],
            [`players.${playerData.player_id}.status`]: 'available',
            'updated_at': admin.firestore.FieldValue.serverTimestamp()
          });
          
          playersReset++;
          console.log(`[RESET-OFFERS] Reset player ${playerData.player_name}`);
          
        } catch (error) {
          console.error(`[RESET-OFFERS] Error resetting player ${playerData.player_name}:`, error);
        }
      }
      
      console.log(`[RESET-OFFERS] Reset ${playersReset} players`);
      
      // NOTE: Cap space will be automatically released when teams check for pending offers
      // The new capManagementService will see no pending offers and report full cap available
      
      // Build summary
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('🔄 OFFERS RESET COMPLETE')
        .setDescription('All pending FA offers have been reset.')
        .addFields(
          { name: '🗑️ Deleted Offers', value: `${deletedOffers} pending offers`, inline: true },
          { name: '🔓 Players Reset', value: `${playersReset} players now available`, inline: true },
          { name: '💰 Cap Space', value: `All teams' cap/exceptions released`, inline: true }
        )
        .addFields({
          name: '📊 Effects',
          value: 
            `• All pending offers deleted from database\n` +
            `• Players returned to "available" status\n` +
            `• Players cleared from current_offers[]\n` +
            `• Cap space automatically released (no pending offers)\n` +
            `• Exceptions automatically released\n` +
            `• Teams can now make new offers`
        })
        .setFooter({ text: `Reset by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({
        embeds: [embed]
      });
      
      console.log(`[RESET-OFFERS] ✅ Reset complete: ${deletedOffers} offers, ${playersReset} players`);
      
    } catch (error) {
      console.error('[RESET-OFFERS] Error:', error);
      await interaction.editReply({
        content: `❌ **Error resetting offers:**\n\`\`\`${error.message}\`\`\``
      });
    }
  },
};