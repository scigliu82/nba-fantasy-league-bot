// ═══════════════════════════════════════════════════════
// CAP MANAGEMENT SERVICE
// Gestisce cap space e exceptions con pending offers locking
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');

// ───────────────────────────────────────────────────────
// EXCEPTION CONSTANTS
// ───────────────────────────────────────────────────────

const EXCEPTIONS = {
  mle: {
    name: 'Non-Taxpayer MLE',
    amount: 14100000,
    max_years: 4,
    can_split: true
  },
  tax_mle: {
    name: 'Taxpayer MLE',
    amount: 5700000,
    max_years: 3,
    can_split: true
  },
  bae: {
    name: 'Bi-Annual Exception',
    amount: 4750000,
    max_years: 2,
    can_split: false, // BAE cannot be split across multiple players
    biannual: true    // Can only be used every other year
  },
  room: {
    name: 'Room Exception',
    amount: 8780000,
    max_years: 2,
    can_split: false
  },
  vet_min: {
    name: 'Veteran Minimum',
    amount: 3200000, // Max vet min
    max_years: 4,
    can_split: true
  }
};

// ───────────────────────────────────────────────────────
// CAP CALCULATION
// ───────────────────────────────────────────────────────

/**
 * Get team's available cap space (after pending offers)
 */
async function getAvailableCapSpace(teamId) {
  const db = admin.firestore();
  
  // Get team data
  const teamDoc = await db.collection('teams').doc(teamId).get();
  const team = teamDoc.data();
  
  const totalCap = team.salary_cap?.cap_space || 0;
  const usedCap = team.salary_cap?.salary_used || 0;
  const baseCap = totalCap - usedCap;
  
  // Get pending offers
  const pendingOffers = await getPendingOffers(teamId);
  
  // Calculate locked cap from pending offers (only cap-funded)
  let lockedCap = 0;
  for (const offer of pendingOffers) {
    if (offer.contract.funding === 'cap' || offer.contract.funding === 'cap_space') {
      lockedCap += offer.contract.annual_salary;
    }
  }
  
  return {
    total_cap: totalCap,
    used_cap: usedCap,
    base_available: baseCap,
    locked_by_pending: lockedCap,
    available_cap: baseCap - lockedCap,
    pending_offers: pendingOffers.filter(o => 
      o.contract.funding === 'cap' || o.contract.funding === 'cap_space'
    )
  };
}

/**
 * Get team's available exception
 */
async function getAvailableException(teamId, exceptionType) {
  const db = admin.firestore();
  
  // Normalize exception type
  const normalizedType = exceptionType.toLowerCase().replace(/_/g, '').replace(/-/g, '');
  let mappedType = normalizedType;
  
  // Map variations
  if (['cap', 'capspace'].includes(normalizedType)) {
    return await getAvailableCapSpace(teamId);
  }
  if (['mle', 'nontaxmle', 'nontaxpayermle'].includes(normalizedType)) {
    mappedType = 'mle';
  }
  if (['taxmle', 'taxpayermle'].includes(normalizedType)) {
    mappedType = 'tax_mle';
  }
  if (['vetmin', 'veteranminimum'].includes(normalizedType)) {
    mappedType = 'vet_min';
  }
  
  const exception = EXCEPTIONS[mappedType];
  if (!exception) {
    return null;
  }
  
  // Get pending offers
  const pendingOffers = await getPendingOffers(teamId);
  
  // Calculate locked amount from pending offers using this exception
  let lockedAmount = 0;
  const relevantOffers = [];
  
  for (const offer of pendingOffers) {
    const offerFunding = offer.contract.funding.toLowerCase().replace(/_/g, '').replace(/-/g, '');
    let offerMappedType = offerFunding;
    
    if (['mle', 'nontaxmle'].includes(offerFunding)) offerMappedType = 'mle';
    if (['taxmle', 'taxpayermle'].includes(offerFunding)) offerMappedType = 'tax_mle';
    if (['vetmin', 'veteranminimum'].includes(offerFunding)) offerMappedType = 'vet_min';
    
    if (offerMappedType === mappedType) {
      if (exception.can_split) {
        // Exception can be split - add to locked amount
        lockedAmount += offer.contract.annual_salary;
        relevantOffers.push(offer);
      } else {
        // Exception cannot be split - if used, it's fully locked
        return {
          exception_name: exception.name,
          exception_type: mappedType,
          total_amount: exception.amount,
          can_split: false,
          used_amount: offer.contract.annual_salary,
          available_amount: 0,
          is_locked: true,
          locked_by_offer: offer,
          pending_offers: [offer]
        };
      }
    }
  }
  
  // Check BAE bi-annual rule
  if (mappedType === 'bae') {
    // TODO: Check if BAE was used last year
    // For now, assume it's available
  }
  
  return {
    exception_name: exception.name,
    exception_type: mappedType,
    total_amount: exception.amount,
    max_years: exception.max_years,
    can_split: exception.can_split,
    used_amount: lockedAmount,
    available_amount: exception.amount - lockedAmount,
    is_locked: !exception.can_split && lockedAmount > 0,
    pending_offers: relevantOffers
  };
}

/**
 * Get all pending offers for a team
 */
async function getPendingOffers(teamId) {
  const db = admin.firestore();
  
  const snapshot = await db.collection('fa_offers')
    .where('team_id', '==', teamId)
    .where('status', '==', 'pending')
    .get();
  
  return snapshot.docs.map(doc => doc.data());
}

/**
 * Validate if team can make this offer
 */
async function validateOfferCapability(teamId, salary, funding) {
  const errors = [];
  const details = {};
  
  if (funding === 'cap' || funding === 'cap_space') {
    const capInfo = await getAvailableCapSpace(teamId);
    details.cap = capInfo;
    
    if (salary > capInfo.available_cap) {
      errors.push({
        type: 'insufficient_cap',
        message: 'Insufficient cap space',
        required: salary,
        available: capInfo.available_cap,
        locked: capInfo.locked_by_pending,
        details: capInfo
      });
    }
  } else {
    const exceptionInfo = await getAvailableException(teamId, funding);
    details.exception = exceptionInfo;
    
    if (!exceptionInfo) {
      errors.push({
        type: 'invalid_exception',
        message: `Unknown exception type: ${funding}`
      });
    } else if (exceptionInfo.is_locked) {
      errors.push({
        type: 'exception_locked',
        message: `${exceptionInfo.exception_name} is already locked by a pending offer`,
        locked_by: exceptionInfo.locked_by_offer
      });
    } else if (salary > exceptionInfo.available_amount) {
      errors.push({
        type: 'insufficient_exception',
        message: `Insufficient ${exceptionInfo.exception_name}`,
        required: salary,
        available: exceptionInfo.available_amount,
        used: exceptionInfo.used_amount,
        total: exceptionInfo.total_amount,
        details: exceptionInfo
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    details
  };
}

/**
 * Build detailed error message
 */
function buildDetailedErrorMessage(validation, teamName, playerName, salary, years, funding) {
  if (validation.valid) return null;
  
  let message = `❌ **CANNOT MAKE THIS OFFER**\n\n`;
  
  // Team info
  message += `**Team:** ${teamName}\n`;
  message += `**Player:** ${playerName}\n`;
  message += `**Offer:** ${years}yr / $${(salary / 1000000).toFixed(1)}M per year\n`;
  message += `**Funding:** ${funding.toUpperCase()}\n\n`;
  
  // Cap/Exception situation
  message += `**📊 Current Situation:**\n`;
  
  if (validation.details.cap) {
    const cap = validation.details.cap;
    message += `• Total Cap Space: $${(cap.total_cap / 1000000).toFixed(1)}M\n`;
    message += `• Used Cap: $${(cap.used_cap / 1000000).toFixed(1)}M\n`;
    message += `• Base Available: $${(cap.base_available / 1000000).toFixed(1)}M\n`;
    
    if (cap.locked_by_pending > 0) {
      message += `• **Locked by Pending Offers: $${(cap.locked_by_pending / 1000000).toFixed(1)}M** (${cap.pending_offers.length} offer${cap.pending_offers.length > 1 ? 's' : ''})\n`;
      
      for (const offer of cap.pending_offers) {
        const hoursLeft = Math.round((offer.expires_at.toDate() - new Date()) / (1000 * 60 * 60));
        message += `  - ${offer.player_name}: $${(offer.contract.annual_salary / 1000000).toFixed(1)}M (expires in ${hoursLeft}h)\n`;
      }
    }
    
    message += `• **Available Cap: $${(cap.available_cap / 1000000).toFixed(1)}M**\n\n`;
  } else if (validation.details.exception) {
    const exc = validation.details.exception;
    message += `• Exception: ${exc.exception_name}\n`;
    message += `• Total: $${(exc.total_amount / 1000000).toFixed(1)}M\n`;
    message += `• Used: $${(exc.used_amount / 1000000).toFixed(1)}M\n`;
    
    if (exc.pending_offers && exc.pending_offers.length > 0) {
      message += `• **Locked by Pending Offers:**\n`;
      for (const offer of exc.pending_offers) {
        const hoursLeft = Math.round((offer.expires_at.toDate() - new Date()) / (1000 * 60 * 60));
        message += `  - ${offer.player_name}: $${(offer.contract.annual_salary / 1000000).toFixed(1)}M (expires in ${hoursLeft}h)\n`;
      }
    }
    
    message += `• **Available: $${(exc.available_amount / 1000000).toFixed(1)}M**\n`;
    message += `• Can split: ${exc.can_split ? 'Yes' : 'No'}\n\n`;
  }
  
  // Problems
  message += `**❌ Problem:**\n`;
  for (const error of validation.errors) {
    if (error.type === 'insufficient_cap') {
      message += `You need $${(error.required / 1000000).toFixed(1)}M but only have $${(error.available / 1000000).toFixed(1)}M available`;
      if (error.locked > 0) {
        message += ` ($${(error.locked / 1000000).toFixed(1)}M locked by pending offers)`;
      }
      message += `\n`;
    } else if (error.type === 'insufficient_exception') {
      message += `You need $${(error.required / 1000000).toFixed(1)}M but only have $${(error.available / 1000000).toFixed(1)}M available`;
      if (error.used > 0) {
        message += ` ($${(error.used / 1000000).toFixed(1)}M locked by pending offers)`;
      }
      message += `\n`;
    } else if (error.type === 'exception_locked') {
      message += `This exception is already locked by a pending offer to ${error.locked_by.player_name}\n`;
    } else {
      message += `${error.message}\n`;
    }
  }
  
  // Solutions
  message += `\n**✅ Possible Solutions:**\n`;
  
  if (validation.errors[0]?.type === 'insufficient_cap' || validation.errors[0]?.type === 'insufficient_exception') {
    const available = validation.errors[0].available;
    message += `1. Reduce salary to $${(available / 1000000).toFixed(1)}M or less\n`;
    
    if (validation.details.cap?.pending_offers?.length > 0) {
      const oldestExpires = Math.min(...validation.details.cap.pending_offers.map(o => o.expires_at.toDate().getTime()));
      const hoursToWait = Math.max(1, Math.round((oldestExpires - Date.now()) / (1000 * 60 * 60)));
      message += `2. Wait ${hoursToWait}h for pending offers to be decided\n`;
    }
    
    // Suggest alternative exceptions
    message += `3. Use alternative funding methods:\n`;
    message += `   • Non-Taxpayer MLE: $14.1M (can split)\n`;
    message += `   • Taxpayer MLE: $5.7M (can split)\n`;
    message += `   • Room Exception: $8.78M\n`;
    message += `   • BAE: $4.75M (every 2 years)\n`;
    message += `   • Veteran Minimum: varies by experience\n`;
  } else if (validation.errors[0]?.type === 'exception_locked') {
    const hoursLeft = Math.round((validation.errors[0].locked_by.expires_at.toDate() - new Date()) / (1000 * 60 * 60));
    message += `1. Wait ${hoursLeft}h for the pending offer to be decided\n`;
    message += `2. Use a different funding method (cap space or other exceptions)\n`;
  }
  
  message += `\n**📚 NBA Rules Applied:**\n`;
  message += `• Pending offers lock cap space/exceptions until decided (48h)\n`;
  message += `• After 48h, declined offers automatically free up cap/exceptions\n`;
  
  if (validation.details.exception && !validation.details.exception.can_split) {
    message += `• ${validation.details.exception.exception_name} cannot be split across multiple players\n`;
  }
  
  return message;
}

module.exports = {
  getAvailableCapSpace,
  getAvailableException,
  getPendingOffers,
  validateOfferCapability,
  buildDetailedErrorMessage,
  EXCEPTIONS
};