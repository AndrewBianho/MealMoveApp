import { prisma } from "./prisma";
import { sendNudgeEmail } from "./email";
import { sendMulticast, type PushSender } from "./firebaseAdmin";

export interface NotifyPayload {
  title: string;
  body: string;
  url: string;
  email: { subject: string; html: string };
}

type Db = Pick<typeof prisma, "user" | "deviceToken">;

export async function dispatchToUser(
  userId: string,
  payload: NotifyPayload,
  deps: { db?: Db; push?: PushSender; email?: typeof sendNudgeEmail } = {}
): Promise<{ channel: "push" | "email" | "none" }> {
  const db = deps.db ?? prisma;
  const push = deps.push ?? sendMulticast;
  const email = deps.email ?? sendNudgeEmail;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, notificationsEnabled: true },
  });
  if (!user || !user.notificationsEnabled) return { channel: "none" };

  const tokens = (
    await db.deviceToken.findMany({ where: { userId }, select: { token: true } })
  ).map((t) => t.token);

  if (tokens.length > 0) {
    const { delivered, invalidTokens } = await push(tokens, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
    });
    if (invalidTokens.length > 0) {
      await db.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
    }
    if (delivered > 0) return { channel: "push" };
  }

  await email(user.email, payload.email.subject, payload.email.html);
  return { channel: "email" };
}
