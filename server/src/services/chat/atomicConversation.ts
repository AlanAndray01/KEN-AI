import mongoose from "mongoose";

// Every nested Mongoose operation participates, including attachment helpers.
// Production MongoDB must support transactions (replica set or sharded cluster).
mongoose.set("transactionAsyncLocalStorage", true);

export async function atomicConversation<T>(work: () => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(work);
}
