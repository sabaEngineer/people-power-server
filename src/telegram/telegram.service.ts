import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TelegramContact = {
  phone_number: string;
  first_name: string;
  last_name?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    contact?: TelegramContact;
  };
  callback_query?: {
    id: string;
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

export type ReplyMarkup = Record<string, unknown>;

const ALLOWED_UPDATES = ['message', 'callback_query'];

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  readonly chatId: string | undefined;

  constructor(private config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!this.botToken || !this.chatId) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — Telegram sending disabled',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  isAllowedChat(chatId: number | string): boolean {
    return String(chatId) === String(this.chatId);
  }

  webhookSecret(): string {
    const raw = `${this.botToken ?? 'bot'}-${this.chatId ?? 'chat'}`;
    return `pp_${raw.replace(/[^A-Za-z0-9_-]/g, '').slice(-80)}`;
  }

  async send(text: string, replyMarkup?: ReplyMarkup): Promise<number | null> {
    if (!this.chatId) return null;
    const body = await this.callJson('sendMessage', {
      chat_id: this.chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    const result = body?.result as { message_id?: number } | undefined;
    return body?.ok ? (result?.message_id ?? null) : null;
  }

  async editMessage(
    messageId: number,
    text: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<boolean> {
    if (!this.chatId) return false;
    return this.call('editMessageText', {
      chat_id: this.chatId,
      message_id: messageId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async answerCallback(id: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', {
      callback_query_id: id,
      ...(text ? { text } : {}),
    });
  }

  async setWebhook(url: string): Promise<boolean> {
    return this.call('setWebhook', {
      url,
      secret_token: this.webhookSecret(),
      drop_pending_updates: false,
      allowed_updates: ALLOWED_UPDATES,
    });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.call('deleteWebhook', { drop_pending_updates: false });
  }

  async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    const body = await this.callJson('getUpdates', {
      offset,
      timeout: 0,
      allowed_updates: ALLOWED_UPDATES,
    });
    if (!body?.ok || !Array.isArray(body.result)) return [];
    return body.result as TelegramUpdate[];
  }

  async setCommands(): Promise<void> {
    await this.call('setMyCommands', {
      commands: [
        { command: 'add', description: 'Add a person, step by step' },
        { command: 'list', description: 'List recent people' },
        { command: 'cancel', description: 'Stop adding a person' },
        { command: 'help', description: 'How to add people' },
      ],
    });
  }

  private async call(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const body = await this.callJson(method, payload);
    return Boolean(body?.ok);
  }

  private async callJson(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok?: boolean; description?: string; result?: unknown } | null> {
    if (!this.botToken) return null;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        description?: string;
        result?: unknown;
      };
      if (!res.ok || !body.ok) {
        this.logger.error(
          `Telegram ${method} failed: ${body.description ?? res.statusText}`,
        );
        return body;
      }
      return body;
    } catch (err) {
      this.logger.error(`Telegram ${method} error: ${(err as Error).message}`);
      return null;
    }
  }
}
