import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  Patch,
  Post,
  Put,
  UnauthorizedException,
  Body,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHmac } from "crypto";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma.service";
import { getUserIdFromAuthorization } from "./access-token";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER";
};

@Controller("auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("register")
  async register(@Body() body: { name?: string; email?: string; password?: string }) {
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!name || !email || !password) {
      throw new BadRequestException("Name, email, and password are required.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Enter a valid email address.");
    }
    if (password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          roles: { create: { role: "CUSTOMER" } },
        },
        select: { id: true, name: true, email: true },
      });
      const authUser: AuthUser = { ...user, role: "CUSTOMER" };
      return { accessToken: this.createAccessToken(authUser), user: authUser };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An account with this email already exists.");
      }
      throw error;
    }
  }

  @Post("login")
  async login(@Body() body: { email?: string; password?: string }) {
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) {
      throw new BadRequestException("Email and password are required.");
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true, status: true },
    });
    if (!user || user.status !== "ACTIVE" || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Email or password is incorrect.");
    }

    const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: "CUSTOMER" };
    return { accessToken: this.createAccessToken(authUser), user: authUser };
  }

  @Post("logout")
  logout() {
    return { success: true };
  }

  @Get("me")
  async profile(@Headers("authorization") authorization?: string) {
    const userId = getUserIdFromAuthorization(authorization);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        addresses: {
          where: { isDefault: true },
          select: {
            id: true,
            fullName: true,
            phone: true,
            addressLine: true,
            city: true,
            postalCode: true,
            country: true,
          },
          take: 1,
        },
      },
    });
    if (!user) throw new UnauthorizedException("Your session is no longer valid. Please sign in again.");
    return { ...user, defaultAddress: user.addresses[0] || null };
  }

  @Patch("me")
  async updateProfile(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: { name?: string; phone?: string | null },
  ) {
    const userId = getUserIdFromAuthorization(authorization);
    const data: { name?: string; phone?: string | null } = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2) throw new BadRequestException("Name must contain at least 2 characters.");
      data.name = name;
    }
    if (body.phone !== undefined) {
      const phone = body.phone?.trim() || null;
      if (phone && phone.length > 30) throw new BadRequestException("Phone number is too long.");
      data.phone = phone;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Provide a name or phone number to update.");
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, phone: true },
    });
  }

  @Put("me/address")
  async saveDefaultAddress(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: {
      fullName?: string;
      phone?: string;
      addressLine?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    },
  ) {
    const userId = getUserIdFromAuthorization(authorization);
    const fullName = body.fullName?.trim();
    const phone = body.phone?.trim();
    const addressLine = body.addressLine?.trim();
    const city = body.city?.trim();
    const postalCode = body.postalCode?.trim();
    const country = body.country?.trim() || "Bangladesh";
    if (!fullName || !phone || !addressLine || !city || !postalCode) {
      throw new BadRequestException("Name, phone, street address, city, and postal code are required.");
    }
    const address = { fullName, phone, addressLine, city, postalCode, country, isDefault: true };
    const existing = await this.prisma.address.findFirst({ where: { userId, isDefault: true } });
    if (existing) {
      return this.prisma.address.update({ where: { id: existing.id }, data: address });
    }
    return this.prisma.address.create({ data: { ...address, userId } });
  }

  private createAccessToken(user: AuthUser) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new InternalServerErrorException("JWT_SECRET is not configured.");
    }
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    })).toString("base64url");
    const unsignedToken = `${header}.${payload}`;
    const signature = createHmac("sha256", secret).update(unsignedToken).digest("base64url");
    return `${unsignedToken}.${signature}`;
  }
}
