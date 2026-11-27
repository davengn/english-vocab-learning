import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import { userSettings } from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import { settingsUpdateSchema } from '../../shared/schemas.js';
import type { SettingsDto } from '../../shared/apiTypes.js';

export function serializeSettings(row: typeof userSettings.$inferSelect): SettingsDto {
  return {
    id: row.id,
    userId: row.userId,
    dailyTargetMinutes: row.dailyTargetMinutes,
    dailyVocabTarget: row.dailyVocabTarget,
    dailyGrammarTarget: row.dailyGrammarTarget,
    uiLanguage: row.uiLanguage,
    defaultReviewDirection: row.defaultReviewDirection,
    keyboardShortcutsEnabled: row.keyboardShortcutsEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrCreateSettings(
  db: AppDatabase,
  userId: string,
): Promise<typeof userSettings.$inferSelect> {
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const [created] = await db
    .insert(userSettings)
    .values({
      userId,
      dailyTargetMinutes: 15,
      dailyVocabTarget: 20,
      dailyGrammarTarget: 2,
      uiLanguage: 'vi',
      defaultReviewDirection: 'en_to_vi',
      keyboardShortcutsEnabled: true,
    })
    .returning();

  return created;
}

export function createSettingsRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get('/settings', async (c) => {
    const userId = await getDefaultUserId(db);
    const settings = await getOrCreateSettings(db, userId);
    return c.json(serializeSettings(settings));
  });

  app.patch('/settings', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = settingsUpdateSchema.parse(body);

    const current = await getOrCreateSettings(db, userId);
    const [updated] = await db
      .update(userSettings)
      .set({
        ...(parsed.dailyTargetMinutes !== undefined
          ? { dailyTargetMinutes: parsed.dailyTargetMinutes }
          : {}),
        ...(parsed.dailyVocabTarget !== undefined
          ? { dailyVocabTarget: parsed.dailyVocabTarget }
          : {}),
        ...(parsed.dailyGrammarTarget !== undefined
          ? { dailyGrammarTarget: parsed.dailyGrammarTarget }
          : {}),
        ...(parsed.defaultReviewDirection !== undefined
          ? { defaultReviewDirection: parsed.defaultReviewDirection }
          : {}),
        ...(parsed.keyboardShortcutsEnabled !== undefined
          ? { keyboardShortcutsEnabled: parsed.keyboardShortcutsEnabled }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(userSettings.id, current.id))
      .returning();

    return c.json(serializeSettings(updated));
  });

  return app;
}
