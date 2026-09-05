import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

// Explicit opt-in: this fixture models pre-upgrade records in the local Compose
// database, modifying only the unique test account and its test messages.
test("legacy Mongo documents retain read and unread states after upgrading", async ({ page }) => {
  test.skip(process.env.ECHO_TEST_MONGO !== "1", "Requires the local Compose Mongo database");
  const fixture = await seedWorkspaceFixture(page);
  const channel = (await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST", body: { name: uniqueSuffix("legacy-activity"), type: "public" },
  })).channel;
  const messages = [];
  for (let i = 0; i < 4; i++) {
    messages.push((await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST", body: { channelId: channel.id, body: `Legacy ${i} @${fixture.alice.username}`, parentId: i >= 2 ? messages[0].id : null },
    })).message);
  }
  const setup = `
    const dbx = db.getSiblingDB("echo");
    const uid = ObjectId(${JSON.stringify(fixture.alice.id)});
    const channel = ObjectId(${JSON.stringify(channel.id)});
    const mids = ${JSON.stringify(messages.map((m) => m.id))}.map(id => ObjectId(id));
    const old = new Date(Date.now() - 20000), cutoff = new Date(Date.now() - 10000), recent = new Date(Date.now() - 5000);
    mids.forEach((id, i) => dbx.messages.updateOne({_id: id}, {$set: {createdAt: i % 2 ? recent : old}}));
    dbx.reads.updateOne({user: uid, channel, thread: null}, {$set: {lastReadAt: cutoff}}, {upsert: true});
    dbx.reads.updateOne({user: uid, channel, thread: mids[0]}, {$set: {lastReadAt: cutoff}}, {upsert: true});
    dbx.users.updateOne({_id: uid}, {$unset: {activityReadBaseline: ""}, $set: {activitySeenAt: cutoff}});
    dbx.activityevents.insertMany([
      {recipient: uid, actor: ObjectId(${JSON.stringify(fixture.bob.id)}), channel, message: mids[0], type: "reaction", emoji: "👍", createdAt: old},
      {recipient: uid, actor: ObjectId(${JSON.stringify(fixture.bob.id)}), channel, message: mids[0], type: "reaction", emoji: "❤️", createdAt: recent}
    ]);
    print(JSON.stringify(dbx.reads.find({user: uid, channel}).toArray()));
  `;
  const mongo = (script) => execFileSync("docker", ["compose", "exec", "-T", "mongo", "mongosh", "--quiet", "--eval", script], { encoding: "utf8" }).trim();
  const original = mongo(setup);
  const getItems = async () => (await requestAsToken(page, fixture.alice.token, "/activity")).items.filter((item) => item.channelId === channel.id);
  const initial = await getItems();
  for (let i = 0; i < 4; i++) expect(initial.find((item) => item.id === messages[i].id)?.unread).toBe(!!(i % 2));
  expect(initial.find((item) => item.emoji === "👍")?.unread).toBe(false);
  expect(initial.find((item) => item.emoji === "❤️")?.unread).toBe(true);
  expect(mongo(`print(JSON.stringify(db.getSiblingDB("echo").reads.find({user: ObjectId(${JSON.stringify(fixture.alice.id)}), channel: ObjectId(${JSON.stringify(channel.id)})}).toArray()))`)).toBe(original);
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/read`, { method: "POST" });
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/read`, { method: "POST", body: { thread: messages[0].id } });
  expect((await getItems()).map((item) => [item.id, item.unread])).toEqual(initial.map((item) => [item.id, item.unread]));
  await requestAsToken(page, fixture.alice.token, "/activity/read", { method: "POST", body: { items: initial.filter((item) => item.unread) } });
  expect((await getItems()).every((item) => !item.unread)).toBe(true);
});
