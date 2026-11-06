import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;

  constructor(private config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!this.botToken || !this.chatId) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — Telegram sending disabled',
      );
    }
  }

  async send(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) return false;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
          }),
        },
      );

      const body = (await res.json()) as { ok?: boolean; description?: string };
      if (!res.ok || !body.ok) {
        this.logger.error(
          `Failed to send Telegram message: ${body.description ?? res.statusText}`,
        );
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error(`Telegram send error: ${(err as Error).message}`);
      return false;
    }
  }
}
