import mongoose from "mongoose";
import { config } from "./config.js";

// Connect to MongoDB with a small retry loop so the server can start
// before Mongo is fully ready (e.g. during docker compose startup).
export async function connectDb(retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.mongoUri);
      console.log("Connected to MongoDB");
      return;
    } catch (err) {
      console.warn(
        `MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`
      );
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
