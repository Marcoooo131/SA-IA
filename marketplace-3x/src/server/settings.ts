import { db } from "./db";
import { commerceSettingsSchema, defaultCommerceSettings, type CommerceSettings } from "./commission/settings-schema";
import { audit } from "./audit";
import type { Actor } from "./auth/actor";
import { assertAdmin } from "./auth/permissions";

const KEY = "commerce";

export async function getCommerceSettings(): Promise<CommerceSettings> {
  const row = await db.adminSetting.findUnique({ where: { key: KEY } });
  if (!row) return defaultCommerceSettings;
  // Fusion avec les valeurs par défaut : un nouveau paramètre ajouté au schéma garde une valeur sûre.
  const parsed = commerceSettingsSchema.safeParse({ ...defaultCommerceSettings, ...(row.value as object) });
  return parsed.success ? parsed.data : defaultCommerceSettings;
}

export async function updateCommerceSettings(actor: Actor, input: unknown): Promise<CommerceSettings> {
  assertAdmin(actor);
  const value = commerceSettingsSchema.parse(input);
  const before = await getCommerceSettings();
  await db.adminSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedBy: actor.id },
    update: { value, updatedBy: actor.id },
  });
  const changed = Object.fromEntries(
    Object.entries(value).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k as keyof CommerceSettings]))
      .map(([k, v]) => [k, { from: before[k as keyof CommerceSettings], to: v }]),
  );
  await audit(actor.id, "settings.update", "AdminSetting", KEY, { changed });
  return value;
}
