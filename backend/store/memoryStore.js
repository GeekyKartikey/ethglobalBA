// backend/store/memoryStore.js

// USERS: privyUserId -> { id, privyUserId, name, email, walletAddress, createdAt }
const users = {};

// GROUPS: groupId -> { id, name, totalRent, token, collectorAddress, createdBy, createdAt }
const groups = {};

// GROUP MEMBERS: groupId -> Set<userId>
const groupMembers = {};

// INVITES: code -> { code, groupId, status, createdAt, acceptedByUserId, createdBy, walletAddress? }
const invites = {};

// X402 AUTHORIZATIONS: `${groupId}:${userId}` -> { status, authorizationId, limit, token }
const x402Authorizations = {};

// SETTLEMENTS: groupId -> [ { id, cid, createdAt } ]
const settlements = {};

// XMTP GROUP THREADS: groupId -> { conversationId, members, lastSentAt, title, lastMessage, lastFailed, lastUnreachable }
const xmtpGroups = {};

// XMTP INVITES: code -> { code, groupId, walletAddress, status, createdAt, acceptedAt? }
const xmtpInvites = {};

// PAYMENT RETRIES: `${groupId}:${userId}` -> { nextRun: ISO string, attempts: number, lastReason?: string }
const paymentRetries = {};

module.exports = {
  users,
  groups,
  groupMembers,
  invites,
  x402Authorizations,
  settlements,
  xmtpGroups,
  xmtpInvites,
  paymentRetries,
};
