const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { generateControlPanel } = require('../../services/controlPanelService');
const admin = require('firebase-admin');

// Lista 30 team NBA
const NBA_TEAMS = [
  'hawks', 'celtics', 'nets', 'hornets', 'bulls',
  'cavaliers', 'mavericks', 'nuggets', 'pistons', 'warriors',
  'rockets', 'pacers', 'clippers', 'lakers', 'grizzlies',
  'heat', 'bucks', 'timberwolves', 'pelicans', 'knicks',
  'thunder', 'magic', 'sixers', 'suns', 'blazers',
  'kings', 'spurs', 'raptors', 'jazz', 'wizards'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-control-panels')
    .setDescription('Setup control panels in all 30 team HQ channels (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const db = admin.firestore();
    const guild = interaction.guild;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    await interaction.editReply('🎛️ Setting up control panels for all teams...\nThis may take 1-2 minutes.');
    
    for (const teamId of NBA_TEAMS) {
      try {
        // Trova canale team HQ (emoji-independent search)
        const channel = guild.channels.cache.find(ch => 
          ch.name.endsWith(`-${teamId}-hq`)
        );
        
        if (!channel) {
          errorCount++;
          errors.push(`❌ ${teamId}: Channel not found`);
          console.warn(`Channel for team ${teamId} not found`);
          continue;
        }
        
        // Controlla se esiste già un control panel
        const teamDoc = await db.collection('teams').doc(teamId).get();
        const existingMessageId = teamDoc.data()?.discord?.control_panel_message_id;
        
        if (existingMessageId) {
          // Prova a cancellare il vecchio messaggio
          try {
            const oldMessage = await channel.messages.fetch(existingMessageId);
            await oldMessage.delete();
            console.log(`Deleted old control panel for ${teamId}`);
          } catch (err) {
            // Messaggio già cancellato o non trovato, va bene
            console.log(`Old control panel for ${teamId} not found (already deleted)`);
          }
        }
        
        // Genera control panel
        const panelMessage = await generateControlPanel(teamId, guild);
        
        // Posta messaggio nel canale
        const message = await channel.send(panelMessage);
        
        // Pin messaggio
        try {
          await message.pin();
        } catch (err) {
          console.warn(`Could not pin message for ${teamId}: ${err.message}`);
          // Non bloccare il processo se il pin fallisce
        }
        
        // Salva message ID nel database
        await db.collection('teams').doc(teamId).update({
          'discord.control_panel_message_id': message.id
        });
        
        successCount++;
        console.log(`✅ Control panel created for ${teamId}`);
        
        // Piccola pausa per evitare rate limiting Discord
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        errorCount++;
        errors.push(`❌ ${teamId}: ${error.message}`);
        console.error(`Error setting up control panel for ${teamId}:`, error);
      }
    }
    
    // Report finale
    let report = `✅ **Control panels setup complete!**\n\n`;
    report += `**Results:**\n`;
    report += `• Success: ${successCount}/30 teams\n`;
    report += `• Errors: ${errorCount}/30 teams\n\n`;
    
    if (errors.length > 0) {
      report += `**Errors:**\n${errors.slice(0, 10).join('\n')}`;
      if (errors.length > 10) {
        report += `\n... and ${errors.length - 10} more errors`;
      }
    } else {
      report += `🎉 All control panels created and pinned successfully!`;
    }
    
    await interaction.editReply(report);
  }
};