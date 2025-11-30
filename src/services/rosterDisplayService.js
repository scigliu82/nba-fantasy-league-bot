// ═══════════════════════════════════════════════════════
// ROSTER DISPLAY SERVICE - Format roster messages
// ═══════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const { collections } = require('../database/firebase');

// ───────────────────────────────────────────────────────
// GENERATE ROSTER MESSAGE
// ───────────────────────────────────────────────────────

async function generateRosterMessage(teamId) {
  try {
    // Get team data
    const teamDoc = await collections.teams().doc(teamId).get();
    
    if (!teamDoc.exists) {
      throw new Error(`Team ${teamId} not found`);
    }

    const team = { id: teamDoc.id, ...teamDoc.data() };

    // Get all players for this team
    const playersSnapshot = await collections.players()
      .where('current_team', '==', teamId)
      .get();

    const players = [];
    playersSnapshot.forEach(doc => {
      players.push({ id: doc.id, ...doc.data() });
    });

    // Separate standard and two-way players
    const standardPlayers = players.filter(p => p.contract_type === 'standard');
    const twoWayPlayers = players.filter(p => p.contract_type === 'two_way');

    // Calculate salary cap info
    const capInfo = calculateCapInfo(standardPlayers, twoWayPlayers);

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(getTeamColor(teamId))
      .setTitle(`🏀 ${team.name} - ROSTER 2025-26`)
      .setDescription(formatCapStatus(capInfo))
      .addFields(
        {
          name: '👥 ROSTER',
          value: formatRosterPlayers(standardPlayers, twoWayPlayers),
          inline: false
        }
      )
      .setFooter({ text: `Last updated: ${new Date().toLocaleDateString('it-IT')}` })
      .setTimestamp();

    return { embeds: [embed] };

  } catch (error) {
    console.error(`Error generating roster for ${teamId}:`, error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// FORMAT CAP STATUS
// ───────────────────────────────────────────────────────

function calculateCapInfo(standardPlayers, twoWayPlayers) {
  const SALARY_CAP = 154647000;
  const LUXURY_TAX = 187895000;
  const FIRST_APRON = 195945000;
  const SECOND_APRON = 207824000;

  // Calculate total salary for 2025-26
  let standardSalary = 0;
  let twoWaySalary = 0;

  for (const player of standardPlayers) {
    const contract = player.contract?.['2025-26'];
    if (contract && contract.salary) {
      standardSalary += contract.salary;
    }
  }

  for (const player of twoWayPlayers) {
    const contract = player.contract?.['2025-26'];
    if (contract && contract.salary) {
      twoWaySalary += contract.salary;
    }
  }

  const totalSalary = standardSalary + twoWaySalary;
  const capSpace = SALARY_CAP - totalSalary;

  // Determine status
  let status = '🟢 Under Cap';
  let statusEmoji = '🟢';

  if (totalSalary > SECOND_APRON) {
    status = '🔴 Over Second Apron';
    statusEmoji = '🔴';
  } else if (totalSalary > FIRST_APRON) {
    status = '🟠 Over First Apron';
    statusEmoji = '🟠';
  } else if (totalSalary > LUXURY_TAX) {
    status = '🟡 Over Luxury Tax';
    statusEmoji = '🟡';
  } else if (totalSalary > SALARY_CAP) {
    status = '🟢 Over Cap';
    statusEmoji = '🟢';
  }

  return {
    standardSalary,
    twoWaySalary,
    totalSalary,
    capSpace,
    status,
    statusEmoji,
    SALARY_CAP,
    LUXURY_TAX,
    FIRST_APRON,
    SECOND_APRON
  };
}

function formatCapStatus(cap) {
  const formatMoney = (amount) => {
    return `$${(amount / 1000000).toFixed(1)}M`;
  };

  return `
**💰 SALARY CAP STATUS**
• Total Salary: **${formatMoney(cap.totalSalary)}**
• Cap Space: ${cap.capSpace >= 0 ? '+' : ''}**${formatMoney(cap.capSpace)}**
• Status: ${cap.status}

**📊 Cap Levels:**
• Salary Cap: ${formatMoney(cap.SALARY_CAP)}
• Luxury Tax: ${formatMoney(cap.LUXURY_TAX)}
• First Apron: ${formatMoney(cap.FIRST_APRON)}
• Second Apron: ${formatMoney(cap.SECOND_APRON)}
  `.trim();
}

// ───────────────────────────────────────────────────────
// FORMAT ROSTER PLAYERS
// ───────────────────────────────────────────────────────

function formatRosterPlayers(standardPlayers, twoWayPlayers) {
  let output = '';

  // Sort players by position and overall
  const positionOrder = { 'PM': 1, 'G': 2, 'AG': 3, 'AP': 4, 'C': 5 };
  
  standardPlayers.sort((a, b) => {
    const posA = a.position.split('/')[0].trim();
    const posB = b.position.split('/')[0].trim();
    
    const orderA = positionOrder[posA] || 99;
    const orderB = positionOrder[posB] || 99;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    return (b.overall || 0) - (a.overall || 0);
  });

  // Group by position
  const groups = {
    'GUARDS': [],
    'FORWARDS': [],
    'CENTERS': []
  };

  for (const player of standardPlayers) {
    const pos = player.position.split('/')[0].trim();
    
    if (pos === 'PM' || pos === 'G') {
      groups.GUARDS.push(player);
    } else if (pos === 'AG' || pos === 'AP') {
      groups.FORWARDS.push(player);
    } else if (pos === 'C') {
      groups.CENTERS.push(player);
    }
  }

  // Format each group
  for (const [groupName, players] of Object.entries(groups)) {
    if (players.length === 0) continue;
    
    output += `\n**${groupName}:**\n`;
    
    for (const player of players) {
      const contract = player.contract?.['2025-26'];
      const salary = contract?.salary || 0;
      const formattedSalary = salary > 0 ? `$${(salary / 1000000).toFixed(1)}M` : 'N/A';
      
      // Find contract expiry
      const expiry = getContractExpiry(player.contract);
      const optionFlag = getOptionFlag(player.contract);
      
      output += `• **${player.name}** (${player.position}, ${player.age}, OVR ${player.overall}) - ${formattedSalary}${expiry}${optionFlag}\n`;
    }
  }

  // Two-way players
  if (twoWayPlayers.length > 0) {
    output += `\n**TWO-WAY (${twoWayPlayers.length}/2):**\n`;
    
    for (const player of twoWayPlayers) {
      output += `• **${player.name}** (${player.position}, ${player.age}, OVR ${player.overall})\n`;
    }
  }

  output += `\n**Total Roster: ${standardPlayers.length}/15 standard, ${twoWayPlayers.length}/2 two-way**`;

  return output || 'No players on roster';
}

function getContractExpiry(contract) {
  if (!contract) return '';
  
  const seasons = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
  
  for (let i = seasons.length - 1; i >= 0; i--) {
    const season = seasons[i];
    const year = contract[season];
    
    if (year && year.status === 'signed' && year.salary > 0) {
      const expYear = season.split('-')[1];
      return ` (exp ${expYear})`;
    }
  }
  
  return '';
}

function getOptionFlag(contract) {
  if (!contract) return '';
  
  const seasons = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
  
  for (const season of seasons) {
    const year = contract[season];
    
    if (year && year.status === 'option') {
      if (year.player_option) {
        return ' 🔸PO';
      } else if (year.team_option) {
        return ' 🔹TO';
      }
    }
  }
  
  return '';
}

// ───────────────────────────────────────────────────────
// TEAM COLORS
// ───────────────────────────────────────────────────────

function getTeamColor(teamId) {
  const colors = {
    hawks: 0xE03A3E,
    celtics: 0x007A33,
    nets: 0x000000,
    hornets: 0x1D1160,
    bulls: 0xCE1141,
    cavaliers: 0x860038,
    mavericks: 0x00538C,
    nuggets: 0x0E2240,
    pistons: 0xC8102E,
    warriors: 0x1D428A,
    rockets: 0xCE1141,
    pacers: 0x002D62,
    clippers: 0xC8102E,
    lakers: 0x552583,
    grizzlies: 0x5D76A9,
    heat: 0x98002E,
    bucks: 0x00471B,
    timberwolves: 0x0C2340,
    pelicans: 0x0C2340,
    knicks: 0x006BB6,
    thunder: 0x007AC1,
    magic: 0x0077C0,
    sixers: 0x006BB6,
    suns: 0x1D1160,
    blazers: 0xE03A3E,
    kings: 0x5A2D81,
    spurs: 0xC4CED4,
    raptors: 0xCE1141,
    jazz: 0x002B5C,
    wizards: 0x002B5C
  };
  
  return colors[teamId] || 0x000000;
}

// ───────────────────────────────────────────────────────
// EXPORTS
// ───────────────────────────────────────────────────────

module.exports = {
  generateRosterMessage,
  calculateCapInfo,
  formatCapStatus,
  getTeamColor
};