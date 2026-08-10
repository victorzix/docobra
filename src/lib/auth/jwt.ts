import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export interface SessionPayload {
  userId: string;
  empresaId: string;
  papel: string;
}

export async function assinarToken(
  payload: SessionPayload,
  expiresIn = "7d",
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verificarToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as SessionPayload;
}
