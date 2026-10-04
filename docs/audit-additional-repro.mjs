// Offline evidence of CURRENT bugs, not tests of desired behavior.
// First: npm.cmd run build -w @Ken/server
// Then: node docs/audit-additional-repro.mjs
import assert from 'node:assert/strict';
globalThis.fetch = async () => { throw new Error('Network prohibited in audit'); };
const { User } = await import('../server/dist/models/User.js');
const { PasswordReset } = await import('../server/dist/models/PasswordReset.js');
const { Session } = await import('../server/dist/models/Session.js');
const { Conversation } = await import('../server/dist/models/Conversation.js');
const { Message } = await import('../server/dist/models/Message.js');
const { Attachment } = await import('../server/dist/models/Attachment.js');
const { Notification } = await import('../server/dist/models/Notification.js');
const { resetPassword } = await import('../server/dist/services/auth/authService.js');
const { updateConversation, listMessages } = await import('../server/dist/services/chat/conversationService.js');
const { exportAllConversations } = await import('../server/dist/services/export/exportService.js');
const { detectImageRequest } = await import('../server/dist/services/chat/imageIntent.js');

let resetFilter;
let savedOtherAccount = false;
const fakeAccount = { _id: '000000000000000000000001', passwordHash: 'old', save: async () => { savedOtherAccount = true; } };
User.findOne = () => ({ select: async () => null });
User.findById = () => ({ select: async () => fakeAccount });
PasswordReset.findOne = filter => {
  resetFilter = filter;
  return { select: async () => ({ userId: fakeAccount._id, save: async () => {} }) };
};
Session.updateMany = async () => ({});
await resetPassword({ email: 'nonexistent@example.invalid', code: '123456', password: 'Audit-only-fake-password-47!' });
assert.equal(Object.hasOwn(resetFilter, 'userId'), false);
assert.equal(savedOtherAccount, true);
console.log('CONFIRMED: unknown email permits unscoped reset-code lookup and changes matched account password.');

const conversationId = '000000000000000000000002';
const conversation = { _id: conversationId, title: 'Audit', providerId: 'groq', modelId: 'audit', pinned: false,
  expiresAt: new Date('2030-01-01'), set(key, value) { this[key] = value; }, save: async () => {} };
Conversation.findOne = async () => conversation;
let updatedMessages = 0;
Message.updateMany = async () => { updatedMessages++; return {}; };
await updateConversation(fakeAccount._id, conversationId, { pinned: true });
assert.equal(conversation.expiresAt, null);
assert.equal(updatedMessages, 0);
console.log('CONFIRMED: pin clears conversation expiry but makes no change to existing message expiries.');

const timestamp = new Date('2026-10-01T00:00:00Z');
let pageFilter;
Message.findOne = async () => ({ _id: '000000000000000000000004', createdAt: timestamp });
Message.find = filter => {
  pageFilter = filter;
  return { sort: () => ({ limit: async () => [] }) };
};
Attachment.find = async () => [];
await listMessages(fakeAccount._id, conversationId, { before: '000000000000000000000004', limit: 1 });
assert.deepEqual(pageFilter.createdAt, { $lt: timestamp });
assert.equal(Object.hasOwn(pageFilter, '$or'), false);
console.log('CONFIRMED: message cursor excludes every other message with the cursor timestamp.');

let exportFilter, exportLimit;
Conversation.find = filter => {
  exportFilter = filter;
  return { sort: () => ({ limit: async limit => { exportLimit = limit; return []; } }) };
};
Notification.create = async input => ({ ...input, _id: 'audit-notification', createdAt: new Date() });
await exportAllConversations(fakeAccount._id, 'json');
assert.equal(exportFilter.archived, false);
assert.equal(exportLimit, 200);
console.log('CONFIRMED: Export all filters out archived chats and limits the query to 200.');

for (const prompt of ['Do not generate an image; just explain the process.', 'How can I generate an image using this API?']) {
  assert.equal(detectImageRequest(prompt), true);
}
console.log('CONFIRMED: negated and instructional image prompts are classified as generation requests.');
