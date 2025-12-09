// ═══════════════════════════════════════════════════════
// GM MANAGEMENT SERVICE
// Handles GM/Co-GM assignment with Discord roles + Database
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');
const { PermissionFlagsBits } = require('discord.js');

// 30 NBA Teams
const NBA_TEAMS = [
  { id: 'hawks', name: 'Atlanta Hawks' },
  { id: 'celtics', name: 'Boston Celtics' },
  { id: 'nets', name: 'Brooklyn Nets' },
  { id: 'hornets', name: 'Charlotte Hornets' },
  { id: 'bulls', name: 'Chicago Bulls' },
  { id: 'cavaliers', name: 'Cleveland Cavaliers' },
  { id: 'mavericks', name: 'Dallas Mavericks' },
  { id: 'nuggets', name: 'Denver Nuggets' },
  { id: 'pistons', name: 'Detroit Pistons' },
  { id: 'warriors', name: 'Golden State Warriors' },
  { id: 'rockets', name: 'Houston Rockets' },
  { id: 'pacers', name: 'Indiana Pacers' },
  { id: 'clippers', name: 'Los Angeles Clippers' },
  { id: 'lakers', name: 'Los Angeles Lakers' },
  { id: 'grizzlies', name: 'Memphis Grizzlies' },
  { id: 'heat', name: 'Miami Heat' },
  { id: 'bucks', name: 'Milwaukee Bucks' },
  { id: 'timberwolves', name: 'Minnesota Timberwolves' },
  { id: 'pelicans', name: 'New Orleans Pelicans' },
  { id: 'knicks', name: 'New York Knicks' },
  { id: 'thunder', name: 'Oklahoma City Thunder' },
  { id: 'magic', name: 'Orlando Magic' },
  { id: 'sixers', name: 'Philadelphia 76ers' },
  { id: 'suns', name: 'Phoenix Suns' },
  { id: 'blazers', name: 'Portland Trail Blazers' },
  { id: 'kings', name: 'Sacramento Kings' },
  { id: 'spurs', name: 'San Antonio Spurs' },
  { id: 'raptors', name: 'Toronto Raptors' },
  { id: 'jazz', name: 'Utah Jazz' },
  { id: 'wizards', name: 'Washington Wizards' }
];

// ═══════════════════════════════════════════════════════
// ROLE MANAGEMENT
// ═══════════════════════════════════════════════════════

/**
 * Get or create team role
 * Uses existing GM-{TeamName} roles created by /setup command
 */
async function getOrCreateTeamRole(guild, teamId, teamName) {
  const db = admin.firestore();
  
  // Check if role exists in database
  const teamDoc = await db.collection('teams').doc(teamId).get();
  const existingRoleId = teamDoc.data()?.discord?.role_id;
  
  if (existingRoleId) {
    // Try to fetch existing role
    const role = guild.roles.cache.get(existingRoleId);
    if (role) {
      return role;
    }
  }
  
  // Generate role name using same logic as setup.js
  // "Los Angeles Lakers" → "Lakers" → "GM-Lakers"
  const shortName = teamName.split(' ').pop();
  const roleName = `GM-${shortName}`;
  
  // Find existing role (created by /setup)
  let role = guild.roles.cache.find(r => r.name === roleName);
  
  if (!role) {
    // Role doesn't exist yet, create it
    // This should rarely happen if /setup was run
    role = await guild.roles.create({
      name: roleName,
      color: getTeamColor(teamId),
      hoist: true, // Display separately in member list
      mentionable: false,
      reason: `GM role for ${teamName}`
    });
    
    console.log(`✅ Created role: ${roleName}`);
  } else {
    console.log(`✅ Found existing role: ${roleName}`);
  }
  
  // Save role ID to database
  await db.collection('teams').doc(teamId).update({
    'discord.role_id': role.id
  });
  
  return role;
}

/**
 * Get team color for role
 */
function getTeamColor(teamId) {
  const colors = {
    lakers: 0x552583,      // Purple
    celtics: 0x007A33,     // Green
    warriors: 0x1D428A,    // Blue
    bulls: 0xCE1141,       // Red
    heat: 0x98002E,        // Red
    nets: 0x000000,        // Black
    knicks: 0x006BB6,      // Blue
    sixers: 0x006BB6,      // Blue
    mavs: 0x00538C,        // Blue
    rockets: 0xCE1141,     // Red
    // Add more as needed
  };
  
  return colors[teamId] || 0x1D428A; // Default blue
}

// ═══════════════════════════════════════════════════════
// GM ASSIGNMENT
// ═══════════════════════════════════════════════════════

/**
 * Assign GM or Co-GM to team
 */
async function assignGM(guild, teamId, teamName, user, roleType) {
  const db = admin.firestore();
  
  try {
    // Get or create team role
    const role = await getOrCreateTeamRole(guild, teamId, teamName);
    
    // Assign role to user
    const member = await guild.members.fetch(user.id);
    await member.roles.add(role);
    
    // Update database
    const teamRef = db.collection('teams').doc(teamId);
    const teamDoc = await teamRef.get();
    
    if (roleType === 'GM') {
      // Set as main GM
      await teamRef.update({
        'discord.gm_id': user.id,
        'discord.gm_name': user.tag
      });
    } else {
      // Add as Co-GM
      const currentCoGMs = teamDoc.data()?.discord?.co_gm_ids || [];
      
      if (!currentCoGMs.includes(user.id)) {
        await teamRef.update({
          'discord.co_gm_ids': admin.firestore.FieldValue.arrayUnion(user.id)
        });
      }
    }
    
    // Update channel permissions
    await updateChannelPermissions(guild, teamId, role);
    
    console.log(`✅ ${user.tag} assigned as ${roleType} of ${teamName}`);
    
    return {
      success: true,
      role: role,
      user: user,
      roleType: roleType
    };
    
  } catch (error) {
    console.error('Error assigning GM:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Remove GM or Co-GM from team
 */
async function removeGM(guild, teamId, user) {
  const db = admin.firestore();
  
  try {
    // Get team data
    const teamDoc = await db.collection('teams').doc(teamId).get();
    
    if (!teamDoc.exists) {
      return { success: false, error: 'Team not found' };
    }
    
    const team = teamDoc.data();
    const roleId = team.discord?.role_id;
    
    // Remove Discord role
    if (roleId) {
      const member = await guild.members.fetch(user.id);
      const role = guild.roles.cache.get(roleId);
      
      if (role && member.roles.cache.has(roleId)) {
        await member.roles.remove(role);
      }
    }
    
    // Update database
    const updates = {};
    
    // Check if main GM
    if (team.discord?.gm_id === user.id) {
      updates['discord.gm_id'] = admin.firestore.FieldValue.delete();
      updates['discord.gm_name'] = admin.firestore.FieldValue.delete();
    }
    
    // Check if Co-GM
    const coGMs = team.discord?.co_gm_ids || [];
    if (coGMs.includes(user.id)) {
      updates['discord.co_gm_ids'] = admin.firestore.FieldValue.arrayRemove(user.id);
    }
    
    if (Object.keys(updates).length > 0) {
      await db.collection('teams').doc(teamId).update(updates);
    }
    
    console.log(`✅ ${user.tag} removed from ${team.name}`);
    
    return {
      success: true,
      user: user
    };
    
  } catch (error) {
    console.error('Error removing GM:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ═══════════════════════════════════════════════════════
// CHANNEL PERMISSIONS
// ═══════════════════════════════════════════════════════

/**
 * Update channel permissions for team role
 */
async function updateChannelPermissions(guild, teamId, role) {
  try {
    // Find team HQ channel
    const channel = guild.channels.cache.find(ch => 
      ch.name.endsWith(`-${teamId}-hq`)
    );
    
    if (!channel) {
      console.warn(`Channel not found for team: ${teamId}`);
      return;
    }
    
    // Set permissions: role can see, @everyone cannot
    await channel.permissionOverwrites.edit(role, {
      [PermissionFlagsBits.ViewChannel]: true,
      [PermissionFlagsBits.SendMessages]: true,
      [PermissionFlagsBits.ReadMessageHistory]: true
    });
    
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      [PermissionFlagsBits.ViewChannel]: false
    });
    
    console.log(`✅ Updated permissions for #${channel.name}`);
    
  } catch (error) {
    console.error('Error updating channel permissions:', error);
  }
}

// ═══════════════════════════════════════════════════════
// SETUP ALL ROLES
// ═══════════════════════════════════════════════════════

/**
 * Setup all 30 team roles and permissions (one-time)
 * Uses existing GM-{TeamName} roles created by /setup command
 */
async function setupAllTeamRoles(guild) {
  const results = {
    success: [],
    errors: [],
    existing: []
  };
  
  for (const team of NBA_TEAMS) {
    try {
      // Find or create role (should already exist from /setup)
      const role = await getOrCreateTeamRole(guild, team.id, team.name);
      
      // Check if it was newly created or already existed
      const shortName = team.name.split(' ').pop();
      const roleName = `GM-${shortName}`;
      
      if (guild.roles.cache.find(r => r.name === roleName && r.id === role.id)) {
        results.existing.push(team.name);
      }
      
      // Update channel permissions
      await updateChannelPermissions(guild, team.id, role);
      
      results.success.push(team.name);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error setting up ${team.name}:`, error);
      results.errors.push({ team: team.name, error: error.message });
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
// GM LISTING
// ═══════════════════════════════════════════════════════

/**
 * Get all GMs for a team
 */
async function getTeamGMs(teamId) {
  const db = admin.firestore();
  
  const teamDoc = await db.collection('teams').doc(teamId).get();
  
  if (!teamDoc.exists) {
    return null;
  }
  
  const team = teamDoc.data();
  
  return {
    teamId: teamId,
    teamName: team.name,
    gm: {
      id: team.discord?.gm_id || null,
      name: team.discord?.gm_name || null
    },
    coGMs: team.discord?.co_gm_ids || []
  };
}

/**
 * Get all GMs across all teams
 */
async function getAllGMs() {
  const db = admin.firestore();
  
  const teamsSnapshot = await db.collection('teams').get();
  const allGMs = [];
  
  teamsSnapshot.forEach(doc => {
    const team = doc.data();
    
    allGMs.push({
      teamId: doc.id,
      teamName: team.name,
      gm: {
        id: team.discord?.gm_id || null,
        name: team.discord?.gm_name || null
      },
      coGMs: team.discord?.co_gm_ids || []
    });
  });
  
  return allGMs;
}

// ═══════════════════════════════════════════════════════
// USER TEAM LOOKUP
// ═══════════════════════════════════════════════════════

/**
 * Get team for a user
 */
async function getUserTeam(userId) {
  const db = admin.firestore();
  
  const teamsSnapshot = await db.collection('teams').get();
  
  for (const teamDoc of teamsSnapshot.docs) {
    const team = teamDoc.data();
    
    // Check if main GM
    if (team.discord?.gm_id === userId) {
      return {
        teamId: teamDoc.id,
        teamName: team.name,
        role: 'GM'
      };
    }
    
    // Check if Co-GM
    if (team.discord?.co_gm_ids?.includes(userId)) {
      return {
        teamId: teamDoc.id,
        teamName: team.name,
        role: 'Co-GM'
      };
    }
  }
  
  return null;
}

/**
 * Check if user is GM/Co-GM of a specific team
 */
async function isUserGMOfTeam(userId, teamId) {
  const db = admin.firestore();
  
  const teamDoc = await db.collection('teams').doc(teamId).get();
  
  if (!teamDoc.exists) {
    return false;
  }
  
  const team = teamDoc.data();
  
  // Check main GM
  if (team.discord?.gm_id === userId) {
    return true;
  }
  
  // Check Co-GMs
  if (team.discord?.co_gm_ids?.includes(userId)) {
    return true;
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  NBA_TEAMS,
  assignGM,
  removeGM,
  setupAllTeamRoles,
  getTeamGMs,
  getAllGMs,
  getUserTeam,
  isUserGMOfTeam,
  getOrCreateTeamRole,
  updateChannelPermissions
};