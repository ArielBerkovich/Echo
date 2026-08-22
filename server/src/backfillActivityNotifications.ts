import mongoose from "mongoose";
import { connectDb } from "./db.js";
import { backfillMessageActivity, coalesceReactionActivity } from "./lib/activityNotifications.js";

async function main() {
  await connectDb();
  await backfillMessageActivity();
  await coalesceReactionActivity();
  await mongoose.connection.close();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
