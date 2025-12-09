// ═══════════════════════════════════════════════════════
// FA OFFER INTERACTION HANDLER
// Handles Step 2 (player selection) and Step 3 (contract form)
// ═══════════════════════════════════════════════════════

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getAvailablePlayers, getPlayersInGroup, getMinimumSalary, createOffer, getPlayer } = require('../services/freeAgentService');
const admin = require('firebase-admin');

module.exports = {
  name: 'interactionCreate',
  
  async execute(interaction) {
    // Handle group selection (Step 1 → Step 2)
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('fa_offer_group_')) {
      await handleGroupSelection(interaction);
      return; // ← IMPORTANTE: blocca altri handler
    }
    
    // Handle player selection (Step 2 → Step 3)
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('fa_offer_player_')) {
      await handlePlayerSelection(interaction);
      return; // ← IMPORTANTE: blocca altri handler
    }
    
    // Handle contract modal submit (Step 3 → Create offer)
    if (interaction.isModalSubmit() && interaction.customId.startsWith('fa_offer_contract_')) {
      await handleContractSubmit(interaction);
      return; // ← IMPORTANTE: blocca altri handler
    }
  }
};

// ═══════════════════════════════════════════════════════
// STEP 2: Player Selection
// ═══════════════════════════════════════════════════════

async function handleGroupSelection(interaction) {
  await interaction.deferUpdate();
  
  const parts = interaction.customId.split('_');
  const season = parts[3];
  const teamId = parts[4];
  const groupId = interaction.values[0];
  
  try {
    const db = admin.firestore();
    
    // Get team
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const team = teamDoc.data();
    
    // Get all available players
    const allPlayers = await getAvailablePlayers(season, { sort_by: 'name' });
    
    // Filter by group
    const playersInGroup = getPlayersInGroup({ players: allPlayers.reduce((acc, p) => {
      acc[p.player_id] = p;
      return acc;
    }, {}) }, groupId);
    
    if (playersInGroup.length === 0) {
      return interaction.editReply({
        content: '❌ No players in this group!',
        components: []
      });
    }
    
    // Create player select menu
    const playerSelect = new StringSelectMenuBuilder()
      .setCustomId(`fa_offer_player_${season}_${teamId}_${groupId}`)
      .setPlaceholder('🏀 Select player')
      .addOptions(
        playersInGroup.slice(0, 25).map(player => ({
          label: player.name,
          description: `${player.role} • OVR ${player.overall} • ${player.age}yr • ${player.experience}yr exp`,
          value: player.player_id
        }))
      );
    
    const row = new ActionRowBuilder().addComponents(playerSelect);
    
    const groupLabel = groupId.split('_')[1];
    const embed = new EmbedBuilder()
      .setColor(0x1D428A)
      .setTitle('✍️ MAKE FREE AGENT OFFER')
      .setDescription(
        `**Step 2/3:** Select player\n\n` +
        `**Group:** ${groupLabel}\n` +
        `**Players available:** ${playersInGroup.length}\n\n` +
        `**Team:** ${team.name}\n` +
        `**Cap Space:** $${(team.salary_cap?.cap_space || 0) / 1000000}M\n` +
        `**Available Cap:** $${(team.salary_cap?.available_cap || 0) / 1000000}M`
      );
    
    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
    
  } catch (error) {
    console.error('Error in group selection:', error);
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
      components: []
    });
  }
}

// ═══════════════════════════════════════════════════════
// STEP 3: Contract Form
// ═══════════════════════════════════════════════════════

async function handlePlayerSelection(interaction) {
  const parts = interaction.customId.split('_');
  const season = parts[3];
  const teamId = parts[4];
  const playerId = interaction.values[0];
  
  try {
    const db = admin.firestore();
    
    // Get player
    const player = await getPlayer(season, playerId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Player not found!',
        ephemeral: true
      });
    }
    
    // Get team
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const team = teamDoc.data();
    
    // Get minimum salary
    const minSalary = getMinimumSalary(player.experience);
    
    // Create modal
    const modal = new ModalBuilder()
      .setCustomId(`fa_offer_contract_${season}_${teamId}_${playerId}`)
      .setTitle(`Offer to ${player.name}`);
    
    // Funding method
    const fundingInput = new TextInputBuilder()
      .setCustomId('funding')
      .setLabel('Funding Method')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('cap / mle / tax_mle / room / bae / vet_min')
      .setRequired(true);
    
    // Years
    const yearsInput = new TextInputBuilder()
      .setCustomId('years')
      .setLabel('Contract Years (1-4)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('2')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(1);
    
    // Annual Salary
    const salaryInput = new TextInputBuilder()
      .setCustomId('salary')
      .setLabel(`Annual Salary (Min: $${(minSalary / 1000000).toFixed(1)}M)`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('5000000')
      .setRequired(true);
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(fundingInput),
      new ActionRowBuilder().addComponents(yearsInput),
      new ActionRowBuilder().addComponents(salaryInput)
    );
    
    await interaction.showModal(modal);
    
  } catch (error) {
    console.error('Error showing modal:', error);
    await interaction.reply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true
    });
  }
}

// ═══════════════════════════════════════════════════════
// STEP 4: Create Offer
// ═══════════════════════════════════════════════════════

async function handleContractSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const parts = interaction.customId.split('_');
  const season = parts[3];
  const teamId = parts[4];
  const playerId = parts[5];
  
  try {
    const db = admin.firestore();
    
    // Get form data
    const funding = interaction.fields.getTextInputValue('funding').toLowerCase().trim();
    const years = parseInt(interaction.fields.getTextInputValue('years'));
    const salary = parseInt(interaction.fields.getTextInputValue('salary'));
    
    // Get player
    const player = await getPlayer(season, playerId);
    
    if (!player || player.status !== 'available') {
      return interaction.editReply({
        content: '❌ Player is no longer available!'
      });
    }
    
    // Get team
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const team = teamDoc.data();
    
    // Validate
    const validation = validateOffer(player, team, { funding, years, salary });
    
    if (!validation.valid) {
      return interaction.editReply({
        content: `❌ **Invalid Offer**\n\n${validation.errors.join('\n')}`
      });
    }
    
    // Create offer
    const offer = await createOffer({
      season,
      player_id: playerId,
      player_name: player.name,
      player_experience: player.experience,
      team_id: teamId,
      team_name: team.name,
      gm_id: interaction.user.id,
      gm_name: interaction.user.tag,
      years,
      annual_salary: salary,
      funding,
      cap_space_at_offer: team.salary_cap?.available_cap || 0
    });
    
    // Update team pending offers
    const pendingTotal = (team.salary_cap?.pending_offers?.total || 0) + salary;
    await db.collection('teams').doc(teamId).update({
      'salary_cap.pending_offers.total': pendingTotal,
      'salary_cap.pending_offers.offers': admin.firestore.FieldValue.arrayUnion({
        offer_id: offer.offer_id,
        amount: salary,
        player: player.name
      }),
      'salary_cap.available_cap': (team.salary_cap?.cap_space || 0) - pendingTotal
    });
    
    // Success embed
    const successEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ OFFER SUBMITTED')
      .setDescription(`Your offer to **${player.name}** has been submitted!`)
      .addFields(
        { name: '🏀 Player', value: `${player.name}\n${player.role} • OVR ${player.overall}`, inline: true },
        { name: '💰 Contract', value: `${years} years\n$${(salary / 1000000).toFixed(1)}M/yr\nTotal: $${(salary * years / 1000000).toFixed(1)}M`, inline: true },
        { name: '💳 Funding', value: funding.toUpperCase(), inline: true },
        { name: '⏰ Decision', value: `Player will decide within 48 hours from first offer`, inline: false }
      )
      .setFooter({ text: `Offer ID: ${offer.offer_id}` });
    
    await interaction.editReply({
      embeds: [successEmbed]
    });
    
    // Public announcement
    await sendOfferAnnouncement(interaction, player, team, offer);
    
    console.log(`✅ ${team.name} offered ${player.name}: ${years}yr/$${salary}`);
    
  } catch (error) {
    console.error('Error creating offer:', error);
    await interaction.editReply({
      content: `❌ Error creating offer: ${error.message}`
    });
  }
}

// ═══════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════

function validateOffer(player, team, contract) {
  const errors = [];
  const { funding, years, salary } = contract;
  
  // Valid funding methods
  const validFunding = ['cap', 'cap_space', 'mle', 'nontax_mle', 'tax_mle', 'room', 'bae', 'vet_min'];
  if (!validFunding.includes(funding.replace(/_/g, ''))) {
    errors.push(`❌ Invalid funding method. Use: cap, mle, tax_mle, room, bae, vet_min`);
  }
  
  // Years
  if (years < 1 || years > 4) {
    errors.push(`❌ Years must be between 1-4`);
  }
  
  // Minimum salary
  const minSalary = getMinimumSalary(player.experience);
  if (salary < minSalary) {
    errors.push(`❌ Salary below minimum ($${(minSalary / 1000000).toFixed(1)}M for ${player.experience}yr exp)`);
  }
  
  // Cap space check
  const availableCap = team.salary_cap?.available_cap || 0;
  if (funding === 'cap' || funding === 'cap_space') {
    if (salary > availableCap) {
      errors.push(`❌ Insufficient cap space (need $${(salary / 1000000).toFixed(1)}M, have $${(availableCap / 1000000).toFixed(1)}M)`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════
// ANNOUNCEMENT
// ═══════════════════════════════════════════════════════

async function sendOfferAnnouncement(interaction, player, team, offer) {
  try {
    const announcementsChannel = interaction.guild.channels.cache.find(ch =>
      ch.name === '📰-announcements' || ch.name.includes('announcements')
    );
    
    if (!announcementsChannel) return;
    
    const expiresAt = offer.expires_at.toDate();
    const hoursRemaining = Math.round((expiresAt - new Date()) / (1000 * 60 * 60));
    
    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('🔔 NEW FREE AGENT OFFER')
      .setDescription(
        `**${team.name}** have opened negotiations with **${player.name}**.\n\n` +
        `The player is currently evaluating the offer.`
      )
      .addFields(
        { name: '🏀 Player', value: `${player.name}\n${player.role} • OVR ${player.overall}`, inline: true },
        { name: '⏰ Decision Deadline', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n(${hoursRemaining}h remaining)`, inline: true }
      );
    
    await announcementsChannel.send({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error sending announcement:', error);
  }
}