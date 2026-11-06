import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import {
  monthKeyboard,
  parseCalCallback,
  yearKeyboard,
} from './telegram-calendar';
import { isAddCommand, parseAddText, parseBirthday } from './telegram-parse';
import {
  TelegramContact,
  TelegramService,
  TelegramUpdate,
} from './telegram.service';

const HELP = `Add people here — they show up in People Power.

Send /add. I’ll ask for:
1. Name
2. Phone
3. Birthday (tap the calendar)
4. Note

You can Skip any step except name. /cancel stops.

Or share a Telegram contact to start with their name and phone.`;

const REMOVE_KEYBOARD = { remove_keyboard: true };

type WizardStep = 'name' | 'phone' | 'birthday' | 'note';

type Wizard = {
  step: WizardStep;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthday?: string;
  description?: string;
  calYear: number;
  calMonth: number;
  calendarMessageId?: number;
};

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);
  private pollOffset: number | undefined;
  private polling = false;
  private useWebhook = false;
  private pollBusy = false;
  private wizard: Wizard | null = null;

  constructor(
    private telegram: TelegramService,
    private contacts: ContactsService,
    private tags: TagsService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.telegram.isConfigured()) return;

    await this.telegram.setCommands();

    const publicUrl = (
      this.config.get<string>('TELEGRAM_WEBHOOK_URL') ||
      this.config.get<string>('RENDER_EXTERNAL_URL') ||
      ''
    ).replace(/\/$/, '');

    if (publicUrl) {
      const webhookUrl = `${publicUrl}/api/telegram/webhook`;
      const ok = await this.telegram.setWebhook(webhookUrl);
      if (ok) {
        this.useWebhook = true;
        this.logger.log(`Telegram webhook set: ${webhookUrl}`);
        return;
      }
      this.logger.warn('Telegram webhook failed — falling back to polling');
    }

    await this.telegram.deleteWebhook();
    this.polling = true;
    this.logger.log('Telegram bot polling for incoming messages');
  }

  @Interval(2500)
  async poll(): Promise<void> {
    if (!this.polling || this.useWebhook || this.pollBusy) return;
    if (!this.telegram.isConfigured()) return;
    this.pollBusy = true;
    try {
      const updates = await this.telegram.getUpdates(this.pollOffset);
      for (const update of updates) {
        this.pollOffset = update.update_id + 1;
        await this.handleUpdate(update);
      }
    } catch (err) {
      this.logger.error(`Telegram poll failed: ${(err as Error).message}`);
    } finally {
      this.pollBusy = false;
    }
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update.callback_query) {
        await this.handleCallback(update);
        return;
      }
      const message = update.message;
      if (!message) return;
      if (!this.telegram.isAllowedChat(message.chat.id)) {
        this.logger.warn(`Ignored Telegram message from chat ${message.chat.id}`);
        return;
      }

      if (message.contact) {
        await this.handleSharedContact(message.contact);
        return;
      }

      const text = message.text?.trim();
      if (!text) return;

      if (/^\/cancel(?:@\w+)?$/i.test(text) || /^cancel$/i.test(text)) {
        await this.cancelWizard();
        return;
      }

      if (/^\/start(?:@\w+)?$/i.test(text) || /^\/help(?:@\w+)?$/i.test(text)) {
        await this.telegram.send(HELP, REMOVE_KEYBOARD);
        return;
      }

      if (/^\/list(?:@\w+)?$/i.test(text)) {
        await this.listContacts();
        return;
      }

      if (isAddCommand(text)) {
        await this.startFromAddCommand(text);
        return;
      }

      if (this.wizard) {
        await this.handleWizardText(text);
        return;
      }

      await this.telegram.send(
        'Send /add to add someone, step by step.\n/help for more.',
      );
    } catch (err) {
      this.logger.error(`Telegram message failed: ${(err as Error).message}`);
      await this.telegram.send('Could not save that. Try /add again.');
    }
  }

  private async handleCallback(update: TelegramUpdate): Promise<void> {
    const cb = update.callback_query;
    if (!cb?.message) return;
    if (!this.telegram.isAllowedChat(cb.message.chat.id)) return;

    const data = cb.data ?? '';
    if (data === 'cal:noop') {
      await this.telegram.answerCallback(cb.id);
      return;
    }

    if (data === 'wiz:cancel') {
      await this.telegram.answerCallback(cb.id, 'Cancelled');
      await this.cancelWizard();
      return;
    }

    if (data === 'wiz:skip') {
      await this.telegram.answerCallback(cb.id);
      if (this.wizard?.step === 'birthday') {
        await this.askNote();
        return;
      }
      if (this.wizard?.step === 'note') {
        await this.finishWizard();
        return;
      }
      if (this.wizard?.step === 'phone') {
        await this.askBirthday();
        return;
      }
      return;
    }

    const cal = parseCalCallback(data);
    if (!cal || !this.wizard || this.wizard.step !== 'birthday') {
      await this.telegram.answerCallback(cb.id);
      return;
    }

    if (cal.kind === 'day' && cal.iso) {
      this.wizard.birthday = cal.iso;
      await this.telegram.answerCallback(cb.id, cal.iso);
      await this.askNote();
      return;
    }

    if (cal.kind === 'month' && cal.year != null && cal.month != null) {
      this.wizard.calYear = cal.year;
      this.wizard.calMonth = cal.month;
      await this.telegram.answerCallback(cb.id);
      await this.refreshCalendar();
      return;
    }

    if (cal.kind === 'year' && cal.year != null && cal.month != null) {
      this.wizard.calYear = cal.year;
      this.wizard.calMonth = cal.month;
      await this.telegram.answerCallback(cb.id);
      await this.refreshCalendar();
      return;
    }

    if (cal.kind === 'years' && cal.fromYear != null) {
      await this.telegram.answerCallback(cb.id);
      if (!this.wizard.calendarMessageId) return;
      await this.telegram.editMessage(
        this.wizard.calendarMessageId,
        `Pick ${this.displayName()}'s birthday — choose a year`,
        yearKeyboard(cal.fromYear, this.wizard.calMonth, this.wizard.calYear),
      );
      return;
    }

    await this.telegram.answerCallback(cb.id);
  }

  private async startFromAddCommand(text: string): Promise<void> {
    const rest = text
      .trim()
      .replace(/^\/add(?:@\w+)?\s*/i, '')
      .replace(/^add\s+/i, '')
      .trim();

    if (!rest) {
      await this.startWizard();
      return;
    }

    const parsed = parseAddText(text);
    if ('error' in parsed) {
      await this.startWizard();
      return;
    }

    const hasExtras = Boolean(
      parsed.phone || parsed.birthday || parsed.socialUrl || parsed.description || parsed.tags.length,
    );
    if (hasExtras) {
      await this.saveParsed(parsed);
      return;
    }

    this.wizard = this.newWizard();
    this.wizard.firstName = parsed.firstName;
    this.wizard.lastName = parsed.lastName;
    await this.askPhone();
  }

  private async startWizard(): Promise<void> {
    this.wizard = this.newWizard();
    this.wizard.step = 'name';
    await this.telegram.send(
      'What is their name?',
      { force_reply: true, input_field_placeholder: 'First and last name' },
    );
  }

  private newWizard(): Wizard {
    const now = new Date();
    return {
      step: 'name',
      calYear: now.getUTCFullYear() - 25,
      calMonth: now.getUTCMonth(),
    };
  }

  private async handleSharedContact(contact: TelegramContact): Promise<void> {
    if (this.wizard?.step === 'phone') {
      this.wizard.phone = contact.phone_number;
      await this.askBirthday();
      return;
    }

    this.wizard = this.newWizard();
    this.wizard.firstName = contact.first_name;
    this.wizard.lastName = contact.last_name?.trim() || '-';
    this.wizard.phone = contact.phone_number;
    await this.askBirthday();
  }

  private async handleWizardText(text: string): Promise<void> {
    if (/^skip$/i.test(text)) {
      if (this.wizard?.step === 'phone') {
        await this.askBirthday();
        return;
      }
      if (this.wizard?.step === 'birthday') {
        await this.askNote();
        return;
      }
      if (this.wizard?.step === 'note') {
        await this.finishWizard();
        return;
      }
    }

    if (!this.wizard) return;

    if (this.wizard.step === 'name') {
      const words = text.split(/\s+/).filter(Boolean);
      this.wizard.firstName = words[0];
      this.wizard.lastName = words.slice(1).join(' ') || '-';
      await this.askPhone();
      return;
    }

    if (this.wizard.step === 'phone') {
      this.wizard.phone = text;
      await this.askBirthday();
      return;
    }

    if (this.wizard.step === 'birthday') {
      const iso = parseBirthday(text);
      if (!iso) {
        await this.telegram.send(
          'Tap a day on the calendar, or send YYYY-MM-DD. Or Skip.',
        );
        return;
      }
      this.wizard.birthday = iso;
      await this.askNote();
      return;
    }

    if (this.wizard.step === 'note') {
      this.wizard.description = text;
      await this.finishWizard();
    }
  }

  private async askPhone(): Promise<void> {
    if (!this.wizard) return;
    this.wizard.step = 'phone';
    await this.telegram.send(
      `Send ${this.displayName()}'s phone number, or share a contact.`,
      {
        keyboard: [
          [{ text: 'Share contact', request_contact: true }],
          [{ text: 'Skip' }, { text: 'Cancel' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
        input_field_placeholder: 'Phone number',
      },
    );
  }

  private async askBirthday(): Promise<void> {
    if (!this.wizard) return;
    this.wizard.step = 'birthday';
    await this.telegram.send('Next: birthday.', REMOVE_KEYBOARD);
    const messageId = await this.telegram.send(
      `Pick ${this.displayName()}'s birthday`,
      monthKeyboard(this.wizard.calYear, this.wizard.calMonth),
    );
    this.wizard.calendarMessageId = messageId ?? undefined;
  }

  private async refreshCalendar(): Promise<void> {
    if (!this.wizard?.calendarMessageId) return;
    await this.telegram.editMessage(
      this.wizard.calendarMessageId,
      `Pick ${this.displayName()}'s birthday`,
      monthKeyboard(this.wizard.calYear, this.wizard.calMonth),
    );
  }

  private async askNote(): Promise<void> {
    if (!this.wizard) return;
    this.wizard.step = 'note';
    const birthday = this.wizard.birthday
      ? ` Birthday: ${this.wizard.birthday}.`
      : '';
    await this.telegram.send(
      `Add a note about ${this.displayName()}?${birthday}\nType it below, or tap Skip.`,
      {
        inline_keyboard: [
          [
            { text: 'Skip', callback_data: 'wiz:skip' },
            { text: 'Cancel', callback_data: 'wiz:cancel' },
          ],
        ],
      },
    );
  }

  private async finishWizard(): Promise<void> {
    const wizard = this.wizard;
    this.wizard = null;
    if (!wizard?.firstName) {
      await this.telegram.send('Cancelled.', REMOVE_KEYBOARD);
      return;
    }

    const userId = await this.requireUser();
    if (!userId) return;

    const saved = await this.contacts.create(userId, {
      firstName: wizard.firstName,
      lastName: wizard.lastName || '-',
      phone: wizard.phone,
      birthday: wizard.birthday,
      description: wizard.description,
    });

    const extras = [
      saved.phone,
      saved.birthday ? String(saved.birthday).slice(0, 10) : null,
    ].filter(Boolean);

    await this.telegram.send(
      `Saved ${saved.firstName} ${saved.lastName}${extras.length ? `\n${extras.join(' · ')}` : ''}`,
      REMOVE_KEYBOARD,
    );
  }

  private async cancelWizard(): Promise<void> {
    const had = Boolean(this.wizard);
    this.wizard = null;
    await this.telegram.send(
      had ? 'Cancelled. Send /add when you want to add someone.' : 'Nothing to cancel.',
      REMOVE_KEYBOARD,
    );
  }

  private displayName(): string {
    if (!this.wizard?.firstName) return 'them';
    const last = this.wizard.lastName && this.wizard.lastName !== '-'
      ? ` ${this.wizard.lastName}`
      : '';
    return `${this.wizard.firstName}${last}`;
  }

  private async saveParsed(parsed: {
    firstName: string;
    lastName: string;
    phone?: string;
    birthday?: string;
    socialUrl?: string;
    description?: string;
    tags: string[];
  }): Promise<void> {
    const userId = await this.requireUser();
    if (!userId) return;

    const tagIds: string[] = [];
    for (const name of parsed.tags) {
      const tag = await this.tags.create(userId, { name });
      tagIds.push(tag.id);
    }

    const saved = await this.contacts.create(userId, {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      phone: parsed.phone,
      birthday: parsed.birthday,
      socialUrl: parsed.socialUrl,
      description: parsed.description,
      tagIds: tagIds.length ? tagIds : undefined,
    });

    await this.telegram.send(
      `Saved ${saved.firstName} ${saved.lastName}`,
      REMOVE_KEYBOARD,
    );
  }

  private async listContacts(): Promise<void> {
    const userId = await this.requireUser();
    if (!userId) return;
    const contacts = await this.contacts.findAll(userId);
    if (!contacts.length) {
      await this.telegram.send('No people yet. Send /add to start.');
      return;
    }
    const lines = contacts
      .slice(0, 30)
      .map((c) => `• ${c.firstName} ${c.lastName}`);
    const more =
      contacts.length > 30 ? `\n…and ${contacts.length - 30} more` : '';
    await this.telegram.send(`People (${contacts.length}):\n${lines.join('\n')}${more}`);
  }

  private async requireUser(): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!user) {
      await this.telegram.send(
        'Sign in to People Power in the web app once, then add people here.',
      );
      return null;
    }
    return user.id;
  }
}
