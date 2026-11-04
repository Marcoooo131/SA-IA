import { execSync } from "node:child_process";

/**
 * Base de test dédiée (jamais la base de développement) : on applique les migrations
 * sans rien effacer. Les tests créent leurs propres données uniques et ne dépendent pas
 * d'une base vide ; pour repartir de zéro : `DATABASE_URL=<base de test> npx prisma migrate reset`.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/marketplace3x_test";
  if (!/test/.test(url)) throw new Error("TEST_DATABASE_URL doit désigner une base de test");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
