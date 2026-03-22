import "dotenv/config";
import { seedLessons } from "../agents/content-producer.js";

async function main() {
  console.log("🌱 Starting lesson seed...\n");

  try {
    await seedLessons();
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

main();
