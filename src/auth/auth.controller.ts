import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport redirects to Google automatically
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req, @Res() res: Response) {
    const user = await this.authService.validateGoogleUser(req.user);
    const token = this.authService.generateJwt(user);
    const clientUrl = this.config.getOrThrow('CLIENT_URL');
    const base = clientUrl.replace(/\/$/, '');
    res.redirect(
      `${base}/auth/callback?token=${encodeURIComponent(token)}`,
    );
  }
}
