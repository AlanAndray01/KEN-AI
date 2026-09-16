import request from "supertest";
import type { Express } from "express";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  explainSkip,
  loadApp,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../test/mongoHarness.js";
import { explainProviderSkip, hasConfiguredAiProvider } from "../test/providerHarness.js";
import { registerVerified } from "../test/registerVerified.js";
import { DEFAULT_GROQ_MODEL_ID } from "@Ken/shared";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "chat routes (real MongoDB)");

const PROVIDER_ENV_KEYS = ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY"];
const providerConfigured = hasConfiguredAiProvider(...PROVIDER_ENV_KEYS);
explainProviderSkip(providerConfigured, "chat routes (real MongoDB)", PROVIDER_ENV_KEYS);

let app: Express;

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  return registerVerified(app, { name: "Tester", email, password: "Correct-horse-battery1!" });
}

/** Seeds a completed exchange directly, so feedback is tested without calling a provider. */
async function seedExchange(userId: string): Promise<{ conversationId: string; assistantId: string }> {
  const conversation = await Conversation.create({
    userId: new Types.ObjectId(userId),
    title: "Seeded chat",
    providerId: "groq",
    modelId: DEFAULT_GROQ_MODEL_ID,
  });

  const userMessage = await Message.create({
    conversationId: conversation._id,
    userId: new Types.ObjectId(userId),
    role: "user",
    content: "Hello",
    status: "complete",
  });

  const assistant = await Message.create({
    conversationId: conversation._id,
    userId: new Types.ObjectId(userId),
    role: "assistant",
    content: "Hi there",
    status: "complete",
    parentMessageId: userMessage._id,
  });

  return { conversationId: String(conversation._id), assistantId: String(assistant._id) };
}

describe.skipIf(!mongo.ok || !providerConfigured)("chat routes (real MongoDB)", () => {
  beforeAll(async () => {
    app = await loadApp();
  });

  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it("requires authentication for every conversation route", async () => {
    expect((await request(app).get("/api/conversations")).status).toBe(401);
    expect((await request(app).post("/api/conversations").send({})).status).toBe(401);
  });

  it("creates a conversation and lists it back for its owner only", async () => {
    const owner = await signUp("owner@example.com");
    const other = await signUp("other@example.com");

    const models = await request(app).get("/api/models").set("Cookie", owner.cookies);
    expect(models.status).toBe(200);
    const model = models.body.models[0] as { id: string; providerId: string } | undefined;
    expect(model, "an AI provider must be configured for this integration test").toBeTruthy();

    const created = await request(app)
      .post("/api/conversations")
      .set("Cookie", owner.cookies)
      .send({ providerId: model!.providerId, modelId: model!.id });
    expect(created.status).toBe(201);
    const conversationId = String(created.body.conversation.id);

    const ownerList = await request(app).get("/api/conversations").set("Cookie", owner.cookies);
    expect(ownerList.body.conversations.map((item: { id: string }) => item.id)).toContain(conversationId);

    const otherList = await request(app).get("/api/conversations").set("Cookie", other.cookies);
    expect(otherList.body.conversations).toHaveLength(0);

    const stolen = await request(app).get(`/api/conversations/${conversationId}`).set("Cookie", other.cookies);
    expect(stolen.status).toBe(404);
  });

  it("returns persisted messages for the owner", async () => {
    const owner = await signUp("owner@example.com");
    const { conversationId } = await seedExchange(owner.userId);

    const response = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Cookie", owner.cookies);

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(2);
    expect(response.body.messages[1].content).toBe("Hi there");
  });

  it("stores feedback in MongoDB and returns it on reload", async () => {
    const owner = await signUp("owner@example.com");
    const { conversationId, assistantId } = await seedExchange(owner.userId);

    const rated = await request(app)
      .post(`/api/conversations/${conversationId}/messages/${assistantId}/feedback`)
      .set("Cookie", owner.cookies)
      .send({ rating: "up" });

    expect(rated.status).toBe(200);
    expect(rated.body.message.feedback).toEqual({ rating: "up" });

    const stored = await Message.findById(assistantId).lean();
    expect(stored?.["feedback"]).toMatchObject({ rating: "up" });

    const reloaded = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Cookie", owner.cookies);
    expect(reloaded.body.messages[1].feedback).toEqual({ rating: "up" });
  });

  it("changes a rating from up to down", async () => {
    const owner = await signUp("owner@example.com");
    const { conversationId, assistantId } = await seedExchange(owner.userId);
    const url = `/api/conversations/${conversationId}/messages/${assistantId}/feedback`;

    await request(app).post(url).set("Cookie", owner.cookies).send({ rating: "up" });
    const changed = await request(app).post(url).set("Cookie", owner.cookies).send({ rating: "down" });

    expect(changed.status).toBe(200);
    expect((await Message.findById(assistantId).lean())?.["feedback"]).toMatchObject({ rating: "down" });
  });

  it("does not let another user rate someone else's message", async () => {
    const owner = await signUp("owner@example.com");
    const attacker = await signUp("attacker@example.com");
    const { conversationId, assistantId } = await seedExchange(owner.userId);

    await request(app)
      .post(`/api/conversations/${conversationId}/messages/${assistantId}/feedback`)
      .set("Cookie", owner.cookies)
      .send({ rating: "up" });

    const attempt = await request(app)
      .post(`/api/conversations/${conversationId}/messages/${assistantId}/feedback`)
      .set("Cookie", attacker.cookies)
      .send({ rating: "down" });

    expect(attempt.status).toBe(404);
    expect((await Message.findById(assistantId).lean())?.["feedback"]).toMatchObject({ rating: "up" });
  });

  it("rejects an unauthenticated, invalid, or unknown rating", async () => {
    const owner = await signUp("owner@example.com");
    const { conversationId, assistantId } = await seedExchange(owner.userId);
    const url = `/api/conversations/${conversationId}/messages/${assistantId}/feedback`;

    expect((await request(app).post(url).send({ rating: "up" })).status).toBe(401);

    const invalid = await request(app).post(url).set("Cookie", owner.cookies).send({ rating: "great" });
    expect(invalid.status).toBe(400);

    const malformed = await request(app)
      .post(`/api/conversations/${conversationId}/messages/not-an-id/feedback`)
      .set("Cookie", owner.cookies)
      .send({ rating: "up" });
    expect(malformed.status).toBe(404);

    const missing = await request(app)
      .post(`/api/conversations/${conversationId}/messages/${new Types.ObjectId().toString()}/feedback`)
      .set("Cookie", owner.cookies)
      .send({ rating: "up" });
    expect(missing.status).toBe(404);
  });

  it("cannot rate a user message, only an assistant reply", async () => {
    const owner = await signUp("owner@example.com");
    const { conversationId } = await seedExchange(owner.userId);
    const userMessage = await Message.findOne({ role: "user" }).lean();

    const response = await request(app)
      .post(`/api/conversations/${conversationId}/messages/${String(userMessage?._id)}/feedback`)
      .set("Cookie", owner.cookies)
      .send({ rating: "up" });

    expect(response.status).toBe(404);
  });

  it("deletes a conversation for its owner and refuses for anyone else", async () => {
    const owner = await signUp("owner@example.com");
    const attacker = await signUp("attacker@example.com");
    const { conversationId } = await seedExchange(owner.userId);

    expect(
      (await request(app).delete(`/api/conversations/${conversationId}`).set("Cookie", attacker.cookies)).status,
    ).toBe(404);
    expect(await Conversation.countDocuments({})).toBe(1);

    expect(
      (await request(app).delete(`/api/conversations/${conversationId}`).set("Cookie", owner.cookies)).status,
    ).toBe(200);
    expect(await Conversation.countDocuments({})).toBe(0);
  });
});
