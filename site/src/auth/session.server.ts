import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadAuthConfig } from "./config";
import { readAuthSession } from "./auth-repository.server";
import { hashSessionToken } from "./security";
import type { AuthAudience, AuthSession } from "./types";

export async function getCurrentAuthSession(): Promise<AuthSession | null> {
  const config = loadAuthConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(config.cookieName)?.value;
  if (!token) {
    return null;
  }
  return readAuthSession(hashSessionToken(token));
}

export async function requireAuthSession(
  audience: AuthAudience,
): Promise<AuthSession> {
  const session = await getCurrentAuthSession();
  if (!session || session.audience !== audience) {
    redirect(audience === "nexi_admin" ? "/nexi-interno/ingresar" : "/ingresar");
  }
  if (audience === "nexi_admin" && session.assuranceLevel !== "aal2") {
    redirect("/nexi-interno/ingresar?error=mfa");
  }
  return session;
}
