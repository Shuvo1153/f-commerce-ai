import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";

export function getUserIdFromAuthorization(
  authorization?: string,
  missingTokenMessage = "Sign in to view your profile.",
): string {
  const [scheme, token, extra] = authorization?.split(" ") || [];
  if (scheme !== "Bearer" || !token || extra) {
    throw new UnauthorizedException(missingTokenMessage);
  }

  const [headerPart, payloadPart, signature] = token.split(".");
  if (!headerPart || !payloadPart || !signature || token.split(".").length !== 3) {
    throw new UnauthorizedException("Your session is invalid. Please sign in again.");
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new InternalServerErrorException("JWT_SECRET is not configured.");
  const expected = createHmac("sha256", secret).update(`${headerPart}.${payloadPart}`).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new UnauthorizedException("Your session is invalid. Please sign in again.");
  }

  try {
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as { alg?: string };
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (header.alg !== "HS256" || typeof payload.sub !== "string" ||
        typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Your session has expired. Please sign in again.");
    }
    return payload.sub;
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw new UnauthorizedException("Your session is invalid. Please sign in again.");
  }
}
