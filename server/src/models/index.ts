import { AIModel } from "./AIModel.js";
import { AIProvider } from "./AIProvider.js";
import { Attachment } from "./Attachment.js";
import { Conversation } from "./Conversation.js";
import { CustomGPT } from "./CustomGPT.js";
import { CustomInstruction } from "./CustomInstruction.js";
import { File } from "./File.js";
import { Memory } from "./Memory.js";
import { Message } from "./Message.js";
import { Notification } from "./Notification.js";
import { PasswordReset } from "./PasswordReset.js";
import { Session } from "./Session.js";
import { SharedConversation } from "./SharedConversation.js";
import { UsageRecord } from "./UsageRecord.js";
import { User } from "./User.js";
import { UserProviderCredential } from "./UserProviderCredential.js";
import { VerificationToken } from "./VerificationToken.js";

export function registerModels(): string[] {
  return [
    AIModel.modelName,
    AIProvider.modelName,
    Attachment.modelName,
    Conversation.modelName,
    CustomGPT.modelName,
    CustomInstruction.modelName,
    File.modelName,
    Memory.modelName,
    Message.modelName,
    Notification.modelName,
    PasswordReset.modelName,
    Session.modelName,
    SharedConversation.modelName,
    UsageRecord.modelName,
    User.modelName,
    UserProviderCredential.modelName,
    VerificationToken.modelName,
  ];
}

export {
  AIModel,
  AIProvider,
  Attachment,
  Conversation,
  CustomGPT,
  CustomInstruction,
  File,
  Memory,
  Message,
  Notification,
  PasswordReset,
  Session,
  SharedConversation,
  UsageRecord,
  User,
  UserProviderCredential,
  VerificationToken,
};
