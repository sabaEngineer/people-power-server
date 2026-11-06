import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramService, TelegramUpdate } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private bot: TelegramBotService,
    private telegram: TelegramService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Req() req: Request,
  ) {
    if (secret !== this.telegram.webhookSecret()) {
      throw new UnauthorizedException();
    }
    await this.bot.handleUpdate(req.body as TelegramUpdate);
    return { ok: true };
  }
}
