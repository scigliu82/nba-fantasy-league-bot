const admin = require('firebase-admin');

// ═══════════════════════════════════════════════════════
// NBA SALARY CAP CONSTANTS (2025-26 Season)
// ═══════════════════════════════════════════════════════

const SALARY_CAP = 154647000;        // $154.6M
const LUXURY_TAX = 187895000;        // $187.9M
const FIRST_APRON = 195945000;       // $195.9M
const SECOND_APRON = 207824000;      // $207.8M

// ═══════════════════════════════════════════════════════
// TRADE VALIDATION SERVICE
// ═══════════════════════════════════════════════════════

/**
 * Valida un trade completo secondo le regole NBA CBA
 * @param {Object} trade - Oggetto trade con tutti i dettagli
 * @returns {Object} - Risultato validazione con dettagli
 */
async function validateTrade(trade) {
  const db = admin.firestore();
  
  console.log('🔍 Starting trade validation...');
  
  const validationResult = {
    valid: true,
    checks: [],
    errors: [],
    warnings: [],
    redFlags: []
  };
  
  try {
    // Fetch team data for all teams involved
    const teamsData = {};
    for (const teamId of trade.teams) {
      const teamDoc = await db.collection('teams').doc(teamId).get();
      if (!teamDoc.exists) {
        validationResult.valid = false;
        validationResult.errors.push(`Team ${teamId} not found in database`);
        return validationResult;
      }
      
      // Calculate current team salary
      const playersSnapshot = await db.collection('players')
        .where('current_team', '==', teamId)
        .get();
      
      let totalSalary = 0;
      let rosterCount = 0;
      
      playersSnapshot.forEach(doc => {
        const player = doc.data();
        const contract = player.contract?.['2025-26'];
        if (contract && contract.salary > 0) {
          totalSalary += contract.salary;
          rosterCount++;
        }
      });
      
      teamsData[teamId] = {
        name: teamDoc.data().name,
        totalSalary,
        rosterCount,
        capStatus: determineCapStatus(totalSalary)
      };
    }
    
    // Validate each team's side of the trade
    for (const teamId of trade.teams) {
      const teamValidation = await validateTeamTrade(
        teamId,
        teamsData[teamId],
        trade[`${teamId}_sends`],
        trade[`${teamId}_receives`],
        trade.teams.filter(t => t !== teamId)
      );
      
      validationResult.checks.push(...teamValidation.checks);
      
      if (!teamValidation.valid) {
        validationResult.valid = false;
        validationResult.errors.push(...teamValidation.errors);
      }
      
      validationResult.warnings.push(...teamValidation.warnings);
    }
    
    // Check for red flags (for commissioner review)
    const redFlags = detectRedFlags(trade, teamsData);
    validationResult.redFlags = redFlags;
    
    console.log(`✅ Trade validation complete: ${validationResult.valid ? 'VALID' : 'INVALID'}`);
    
  } catch (error) {
    console.error('❌ Error during trade validation:', error);
    validationResult.valid = false;
    validationResult.errors.push(`Validation error: ${error.message}`);
  }
  
  return validationResult;
}

/**
 * Valida il lato di un singolo team nel trade
 */
async function validateTeamTrade(teamId, teamData, sends, receives, otherTeams) {
  const result = {
    valid: true,
    checks: [],
    errors: [],
    warnings: []
  };
  
  // 1. SALARY MATCHING
  const salaryCheck = checkSalaryMatching(teamData, sends.total_salary, receives.total_salary);
  result.checks.push(salaryCheck);
  
  if (!salaryCheck.passed) {
    result.valid = false;
    result.errors.push(salaryCheck.message);
  }
  
  // 2. APRON RESTRICTIONS
  const apronChecks = checkApronRestrictions(teamData, sends, receives);
  result.checks.push(...apronChecks);
  
  const failedApronChecks = apronChecks.filter(c => !c.passed);
  if (failedApronChecks.length > 0) {
    result.valid = false;
    result.errors.push(...failedApronChecks.map(c => c.message));
  }
  
  // 3. ROSTER SPOTS
  const rosterCheck = checkRosterSpots(teamData, sends.players.length, receives.players.length);
  result.checks.push(rosterCheck);
  
  if (!rosterCheck.passed) {
    result.valid = false;
    result.errors.push(rosterCheck.message);
  }
  
  // 4. CAP IMPACT
  const capImpact = calculateCapImpact(teamData, sends.total_salary, receives.total_salary);
  result.checks.push({
    category: 'Cap Impact',
    passed: true,
    message: `${teamData.name} cap ${capImpact.change >= 0 ? 'increases' : 'decreases'} by $${Math.abs(capImpact.change / 1000000).toFixed(1)}M`,
    details: capImpact
  });
  
  // 5. HARD CAP CHECK (se rilevante)
  if (capImpact.newTotal > FIRST_APRON && teamData.totalSalary <= FIRST_APRON) {
    result.warnings.push(`${teamData.name} will cross First Apron threshold (+$${((capImpact.newTotal - FIRST_APRON) / 1000000).toFixed(1)}M)`);
  }
  
  if (capImpact.newTotal > SECOND_APRON && teamData.totalSalary <= SECOND_APRON) {
    result.warnings.push(`${teamData.name} will cross Second Apron threshold (+$${((capImpact.newTotal - SECOND_APRON) / 1000000).toFixed(1)}M)`);
  }
  
  return result;
}

/**
 * Determina lo status del team rispetto al salary cap
 */
function determineCapStatus(totalSalary) {
  if (totalSalary < SALARY_CAP) {
    return 'under_cap';
  } else if (totalSalary < LUXURY_TAX) {
    return 'over_cap';
  } else if (totalSalary < FIRST_APRON) {
    return 'over_tax';
  } else if (totalSalary < SECOND_APRON) {
    return 'over_first_apron';
  } else {
    return 'over_second_apron';
  }
}

/**
 * Controlla se il salary matching è valido
 */
function checkSalaryMatching(teamData, salaryOut, salaryIn) {
  const check = {
    category: 'Salary Matching',
    passed: false,
    message: '',
    details: {}
  };
  
  // Se il team sta diminuendo il salario, è sempre OK
  if (salaryIn <= salaryOut) {
    check.passed = true;
    check.message = `${teamData.name} salary matching: VALID (decreasing salary)`;
    check.details = {
      salaryOut: salaryOut,
      salaryIn: salaryIn,
      difference: salaryOut - salaryIn,
      rule: 'Decreasing salary (always valid)'
    };
    return check;
  }
  
  // Se il team sta aumentando, controlla le regole
  const capStatus = teamData.capStatus;
  let maxAllowedIn;
  let ruleName;
  
  if (capStatus === 'under_cap' || capStatus === 'over_cap' || capStatus === 'over_tax') {
    // Under First Apron: 125% + $100k
    maxAllowedIn = (salaryOut * 1.25) + 100000;
    ruleName = '125% + $100k';
  } else if (capStatus === 'over_first_apron') {
    // Between First and Second Apron: 110% + $500k
    maxAllowedIn = (salaryOut * 1.10) + 500000;
    ruleName = '110% + $500k';
  } else {
    // Over Second Apron: 100% (no increase allowed)
    maxAllowedIn = salaryOut;
    ruleName = '100% (no increase)';
  }
  
  check.details = {
    salaryOut: salaryOut,
    salaryIn: salaryIn,
    difference: salaryIn - salaryOut,
    maxAllowedIn: maxAllowedIn,
    rule: ruleName,
    capStatus: capStatus
  };
  
  if (salaryIn <= maxAllowedIn) {
    check.passed = true;
    check.message = `${teamData.name} salary matching: VALID (${ruleName})`;
  } else {
    check.passed = false;
    check.message = `${teamData.name} salary matching: INVALID - Incoming salary ($${(salaryIn / 1000000).toFixed(1)}M) exceeds ${ruleName} rule (max $${(maxAllowedIn / 1000000).toFixed(1)}M)`;
  }
  
  return check;
}

/**
 * Controlla le restrizioni dell'Apron
 */
function checkApronRestrictions(teamData, sends, receives) {
  const checks = [];
  const capStatus = teamData.capStatus;
  
  // RESTRICTION 1: Over Second Apron → NO Aggregation
  if (capStatus === 'over_second_apron') {
    // Aggregation = sending multiple players, receiving 1
    if (sends.players.length > 1 && receives.players.length === 1) {
      checks.push({
        category: 'Apron Restrictions',
        passed: false,
        message: `${teamData.name} cannot aggregate players (over Second Apron)`
      });
    } else {
      checks.push({
        category: 'Apron Restrictions',
        passed: true,
        message: `${teamData.name} aggregation check: OK`
      });
    }
  }
  
  // RESTRICTION 2: Over First Apron → NO Cash
  if (capStatus === 'over_first_apron' || capStatus === 'over_second_apron') {
    if (sends.cash && sends.cash > 0) {
      checks.push({
        category: 'Apron Restrictions',
        passed: false,
        message: `${teamData.name} cannot send cash in trades (over First Apron)`
      });
    } else {
      checks.push({
        category: 'Apron Restrictions',
        passed: true,
        message: `${teamData.name} cash restriction: OK`
      });
    }
  }
  
  return checks;
}

/**
 * Controlla i posti roster disponibili
 */
function checkRosterSpots(teamData, playersOut, playersIn) {
  const currentRoster = teamData.rosterCount;
  const newRoster = currentRoster - playersOut + playersIn;
  
  const check = {
    category: 'Roster Spots',
    passed: false,
    message: '',
    details: {
      current: currentRoster,
      playersOut: playersOut,
      playersIn: playersIn,
      projected: newRoster
    }
  };
  
  // NBA roster limits: minimum 13, maximum 15 (+ 2 two-way)
  if (newRoster < 13) {
    check.passed = false;
    check.message = `${teamData.name} roster would be below minimum (${newRoster}/13)`;
  } else if (newRoster > 15) {
    check.passed = false;
    check.message = `${teamData.name} roster would exceed maximum (${newRoster}/15)`;
  } else {
    check.passed = true;
    check.message = `${teamData.name} roster spots: OK (${currentRoster} → ${newRoster})`;
  }
  
  return check;
}

/**
 * Calcola l'impatto sul salary cap
 */
function calculateCapImpact(teamData, salaryOut, salaryIn) {
  const currentTotal = teamData.totalSalary;
  const newTotal = currentTotal - salaryOut + salaryIn;
  const change = salaryIn - salaryOut;
  
  return {
    currentTotal: currentTotal,
    newTotal: newTotal,
    change: change,
    currentStatus: teamData.capStatus,
    newStatus: determineCapStatus(newTotal),
    distanceFromCap: newTotal - SALARY_CAP,
    distanceFromTax: newTotal - LUXURY_TAX,
    distanceFromFirstApron: newTotal - FIRST_APRON,
    distanceFromSecondApron: newTotal - SECOND_APRON
  };
}

/**
 * Rileva red flags per il commissioner
 */
function detectRedFlags(trade, teamsData) {
  const redFlags = [];
  
  // RED FLAG 1: Value Imbalance
  for (const teamId of trade.teams) {
    const sends = trade[`${teamId}_sends`];
    const receives = trade[`${teamId}_receives`];
    
    // Calcola overall totale
    let sendsOVR = 0;
    let receivesOVR = 0;
    
    sends.players.forEach(p => sendsOVR += p.overall || 0);
    receives.players.forEach(p => receivesOVR += p.overall || 0);
    
    const ovrDifference = receivesOVR - sendsOVR;
    
    // Se un team riceve +15 OVR o più, flag
    if (ovrDifference >= 15) {
      redFlags.push({
        type: 'value_imbalance',
        severity: 'medium',
        team: teamId,
        message: `${teamsData[teamId].name} receives significantly better value (+${ovrDifference} total OVR)`
      });
    }
  }
  
  // RED FLAG 2: Salary Dump
  for (const teamId of trade.teams) {
    const sends = trade[`${teamId}_sends`];
    const receives = trade[`${teamId}_receives`];
    
    const salaryReduction = sends.total_salary - receives.total_salary;
    
    // Se un team scarica $20M+ di salario
    if (salaryReduction > 20000000) {
      redFlags.push({
        type: 'salary_dump',
        severity: 'low',
        team: teamId,
        message: `${teamsData[teamId].name} dumps $${(salaryReduction / 1000000).toFixed(1)}M in salary`
      });
    }
  }
  
  // RED FLAG 3: One-Sided Trade (molti players vs 1)
  for (const teamId of trade.teams) {
    const sends = trade[`${teamId}_sends`];
    const receives = trade[`${teamId}_receives`];
    
    if (sends.players.length >= 3 && receives.players.length === 1) {
      redFlags.push({
        type: 'one_sided',
        severity: 'low',
        team: teamId,
        message: `${teamsData[teamId].name} sends ${sends.players.length} players for only 1`
      });
    }
  }
  
  return redFlags;
}

/**
 * Formatta il risultato della validazione per Discord
 */
function formatValidationForDiscord(validationResult) {
  let message = '🔍 **TRADE VALIDATION RESULTS**\n\n';
  
  // Status generale
  if (validationResult.valid) {
    message += '✅ **Status:** VALID - Trade can proceed\n\n';
  } else {
    message += '❌ **Status:** INVALID - Trade cannot proceed\n\n';
  }
  
  // Errori (se presenti)
  if (validationResult.errors.length > 0) {
    message += '**❌ Errors:**\n';
    validationResult.errors.forEach(error => {
      message += `• ${error}\n`;
    });
    message += '\n';
  }
  
  // Checks dettagliati
  message += '**Validation Checks:**\n';
  validationResult.checks.forEach(check => {
    const emoji = check.passed ? '✅' : '❌';
    message += `${emoji} ${check.category}: ${check.message}\n`;
  });
  message += '\n';
  
  // Warnings (se presenti)
  if (validationResult.warnings.length > 0) {
    message += '**⚠️ Warnings:**\n';
    validationResult.warnings.forEach(warning => {
      message += `• ${warning}\n`;
    });
    message += '\n';
  }
  
  // Red Flags per commissioner
  if (validationResult.redFlags.length > 0) {
    message += '**🚩 Red Flags (Commissioner Review):**\n';
    validationResult.redFlags.forEach(flag => {
      const severityEmoji = flag.severity === 'high' ? '🔴' : flag.severity === 'medium' ? '🟡' : '🟢';
      message += `${severityEmoji} ${flag.message}\n`;
    });
  }
  
  return message;
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  validateTrade,
  validateTeamTrade,
  checkSalaryMatching,
  checkApronRestrictions,
  checkRosterSpots,
  calculateCapImpact,
  detectRedFlags,
  formatValidationForDiscord,
  
  // Export constants
  SALARY_CAP,
  LUXURY_TAX,
  FIRST_APRON,
  SECOND_APRON
};