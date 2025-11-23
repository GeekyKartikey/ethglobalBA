// backend/store/memoryStore.js

// USERS: privyUserId -> { id, privyUserId, email, walletAddress, createdAt }
const users = {};

// GROUPS: groupId -> { id, name, totalRent, token, collectorAddress, createdBy, createdAt }
const groups = {};

// GROUP MEMBERS: groupId -> Set<userId>
const groupMembers = {};

// INVITES: code -> { code, groupId, status, createdAt, acceptedByUserId }
const invites = {};

// X402 AUTHORIZATIONS: `${groupId}:${userId}` -> { status, authorizationId, limit, token }
const x402Authorizations = {};

// SETTLEMENTS: groupId -> [ { id, cid, createdAt } ]
const settlements = {};

module.exports = {
  users,
  groups,
  groupMembers,
  invites,
  x402Authorizations,
  settlements,
};
