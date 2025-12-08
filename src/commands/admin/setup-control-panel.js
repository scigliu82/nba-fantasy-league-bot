const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { generateControlPanel } = require('../../services/controlPanelService');
const admin = require('firebase-admin');

// Team mapping for autocomplete
const TEAM_NAMES = {
  'Atlanta Hawks': 'hawks',
  'Boston Celtics': 'celtics',
  'Brooklyn Nets': 'nets',
  'Charlotte Hornets': 'hornets',
  'Chicago Bulls': 'bulls',
  'Cleveland Cavaliers': 'cavaliers',
  'Dallas Mavericks': 'mavericks',
  'Denver Nuggets': 'nuggets',
  'Detroit Pistons': 'pistons',
  'Golden State Warriors': 'warriors',
  'Houston Rockets': 'rockets',
  'Indiana Pacers': 'pacers',
  'Los Angeles Clippers': 'clippers',
  'Los Angeles Lakers': 'lakers',
  'Memphis Grizzlies': 'grizzlies',
  'Miami Heat': 'heat',
  'Milwaukee Bucks': 'bucks',
  'Minnesota Timberwolves': 'timberwolves',
  'New Orleans Pelicans': 'pelicans',
  'New York Knicks': 'knicks',
  'Oklahoma City Thunder': 'thunder',
  'Orlando Magic': 'magic',
  'Philadelphia 76ers': 'sixers',
  'Phoenix Suns': 'suns',
  'Portland Trail Blazers': 'blazers',
  'Sacramento Kings': 'kings',
  'San Antonio Spurs': 'spurs',
  'Toronto Raptors': 'raptors',
  'Utah Jazz': 'jazz',
  'Washington Wizards': 'wizards'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-control-panel')
    .setDescription('Setup control panel for a single team (Admin only)')
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Team to setup control panel for')
        .setRequired(true)
        .setAutocomplete(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const choices = Object.keys(TEAM_NAMES);
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
    await interaction.deferReply({ ephemeral: true });
    
    const db = admin.firestore();
    const teamName = interaction.options.getString('team');
    const teamId = TEAM_NAMES[teamName];
    
    if (!teamId) {
      return interaction.editReply('❌ Invalid team selected!');
    }
    
    const guild = interaction.guild;
    
    try {
      // Trova canale team HQ (emoji-independent search)
      const channel = guild.channels.cache.find(ch => 
        ch.name.endsWith(`-${teamId}-hq`)
      );
      
      if (!channel) {
        return interaction.editReply(
          `❌ **Channel not found!**\n\n` +
          `Could not find channel ending with \`-${teamId}-hq\`\n` +
          `Make sure the team HQ channel exists.`
        );
      }
      
      // Controlla se esiste già un control panel
      const teamDoc = await db.collection('teams').doc(teamId).get();
      
      if (!teamDoc.exists) {
        return interaction.editReply(
          `❌ **Team not found in database!**\n\n` +
          `Team ID: \`${teamId}\`\n` +
          `Make sure the team exists in Firestore.`
        );
      }
      
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
      
      // Genera nuovo control panel
      const panelMessage = await generateControlPanel(teamId, guild);
      
      // Posta messaggio nel canale
      const message = await channel.send(panelMessage);
      
      // Pin messaggio
      try {
        await message.pin();
      } catch (err) {
        console.warn(`Could not pin message for ${teamId}: ${err.message}`);
        // Continua anche se il pin fallisce
      }
      
      // Salva message ID nel database
      await db.collection('teams').doc(teamId).update({
        'discord.control_panel_message_id': message.id
      });
      
      await interaction.editReply(
        `✅ **Control panel created successfully!**\n\n` +
        `**Team:** ${teamName}\n` +
        `**Channel:** ${channel}\n` +
        `**Message ID:** \`${message.id}\`\n\n` +
        `The control panel has been pinned to the channel.\n` +
        `Use this command if a GM accidentally deletes the panel!`
      );
      
    } catch (error) {
      console.error('Error setting up control panel:', error);
      await interaction.editReply(
        `❌ **Error setting up control panel**\n\n` +
        `**Error:** ${error.message}\n\n` +
        `Check the console for more details.`
      );
    }
  }
};