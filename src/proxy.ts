import { NextResponse, type NextRequest } from "next/server";

import { resolveSessionAction } from "@/lib/auth/middleware-session";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth/constants";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const resultado = await resolveSessionAction(token);

  if (resultado.action === "redirect") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE_NAME, resultado.novoToken, SESSION_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
