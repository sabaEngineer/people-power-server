import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

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
    private email: EmailService,
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
      void this.email.send(
        user.email,
        'Welcome to People Power',
        welcomeEmailHtml(user.name ?? 'there'),
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

function welcomeEmailHtml(name: string): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #1a1a2e;">
      <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 24px;">Welcome to People Power</h1>
      <p style="font-size: 16px; line-height: 1.6;">Hey ${name},</p>
      <p style="font-size: 16px; line-height: 1.6;">
        Your personal relationship CRM is ready. Start adding the people you meet and never forget what matters about them.
      </p>
      <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">— People Power</p>
    </div>
  `;
}
