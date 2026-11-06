import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

interface GoogleUser {
  googleId: string;
  email: string;
  name?: string;
  avatar?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private telegram: TelegramService,
  ) {}

  async validateGoogleUser(googleUser: GoogleUser) {
    let isNew = false;
    const existing = await this.prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
    });
    if (!existing) isNew = true;

    const user = await this.prisma.user.upsert({
      where: { googleId: googleUser.googleId },
      update: {
        name: googleUser.name,
        avatar: googleUser.avatar,
      },
      create: {
        googleId: googleUser.googleId,
        email: googleUser.email,
        name: googleUser.name,
        avatar: googleUser.avatar,
      },
    });

    if (isNew) {
      const name = user.name ?? 'there';
      void this.telegram.send(
        `Welcome to People Power\n\nHey ${name},\nYour personal relationship CRM is ready. Start adding the people you meet and never forget what matters about them.`,
      );
    }

    return user;
  }

  generateJwt(user: { id: string; email: string; name?: string | null }) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name ?? undefined,
    });
  }
}
