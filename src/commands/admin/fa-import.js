// ═══════════════════════════════════════════════════════
// FA IMPORT COMMAND - Import Free Agents from JSON
// Admin only command to populate FA market
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { importFAMarket } = require('../../services/freeAgentService');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fa-import')
    .setDescription('Import Free Agents from JSON file (Admin only)')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('Season to import (e.g., 2025-26)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('file')
        .setDescription('JSON file name in data folder')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const season = interaction.options.getString('season');
    const fileName = interaction.options.getString('file') || 'ufa_2025_import.json';
    
    try {
      // Read JSON file
      const filePath = path.join(process.cwd(), 'data', fileName);
      
      console.log(`[FA-IMPORT] Attempting to read file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        return interaction.editReply({
          content: `❌ **File not found:** \`${fileName}\`\n\n` +
            `Make sure the file exists in the \`data\` folder.`
        });
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      if (!data.players || typeof data.players !== 'object') {
        return interaction.editReply({
          content: `❌ **Invalid file format**\n\n` +
            `The JSON file must contain a \`players\` object.`
        });
      }
      
      // Import to Firestore
      await interaction.editReply({
        content: `⏳ Importing ${Object.keys(data.players).length} free agents...`
      });
      
      const result = await importFAMarket(season, data.players);
      
      // Success embed
      const successEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ FREE AGENTS IMPORTED')
        .setDescription(`Successfully imported FA market for **${season}**`)
        .addFields(
          { name: '📊 Total Players', value: result.count.toString(), inline: true },
          { name: '📅 Season', value: season, inline: true },
          { name: '📄 Source File', value: fileName, inline: true }
        )
        .setFooter({ text: `Imported at ${new Date().toLocaleString()}` });
      
      // Count by role
      const roles = {};
      Object.values(data.players).forEach(player => {
        const role = player.role || 'Unknown';
        roles[role] = (roles[role] || 0) + 1;
      });
      
      const rolesList = Object.entries(roles)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([role, count]) => `• ${role}: ${count}`)
        .join('\n');
      
      successEmbed.addFields({
        name: '🏀 Top Roles',
        value: rolesList || 'N/A'
      });
      
      await interaction.editReply({
        content: null,
        embeds: [successEmbed]
      });
      
      console.log(`✅ Admin ${interaction.user.tag} imported ${result.count} free agents for ${season}`);
      
    } catch (error) {
      console.error('Error importing FA market:', error);
      
      await interaction.editReply({
        content: `❌ **Error importing free agents**\n\n` +
          `**Error:** ${error.message}\n\n` +
          `Check the console for more details.`
      });
    }
  }
};