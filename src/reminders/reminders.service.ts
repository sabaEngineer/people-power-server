import { Injectable, Logger } from '@nestjs/common';
import { BirthdayReminderType, FactType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

const FACT_TYPE_LABELS: Record<FactType, string> = {
  PAIN: 'Pain / Problem',
  GOAL: 'Goal / Target',
  LIKE: 'Likes',
};

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /** Daily tick: send fact reminders and birthday reminders. */
  async runDailyReminders(): Promise<void> {
    const today = startOfUtcDay(new Date());
    await this.sendFactReminders(today);
    await this.sendBirthdayReminders(today);
  }

  private async sendFactReminders(today: Date) {
    const facts = await this.prisma.fact.findMany({
      where: {
        reminderDate: today,
        reminderSent: false,
      },
      include: {
        contact: { include: { user: true } },
      },
    });

    for (const fact of facts) {
      const { contact } = fact;
      const label = FACT_TYPE_LABELS[fact.type];
      const subject = `Reminder: ${contact.firstName} ${contact.lastName}`;
      const html = `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
          <h2 style="font-size: 18px; margin-bottom: 16px;">Reminder about ${contact.firstName} ${contact.lastName}</h2>
          <p style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">${label}</p>
          <p style="font-size: 16px; line-height: 1.6;">${escapeHtml(fact.content)}</p>
          <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">— People Power</p>
        </div>
      `;

      const sent = await this.email.send(contact.user.email, subject, html);
      if (sent) {
        await this.prisma.fact.update({
          where: { id: fact.id },
          data: { reminderSent: true },
        });
      }
    }

    if (facts.length) {
      this.logger.log(`Processed ${facts.length} fact reminder(s)`);
    }
  }

  private async sendBirthdayReminders(today: Date) {
    const contacts = await this.prisma.contact.findMany({
      where: { birthday: { not: null } },
      include: {
        user: true,
        birthdayReminderLogs: {
          where: { year: today.getUTCFullYear() },
        },
      },
    });

    const year = today.getUTCFullYear();

    for (const contact of contacts) {
      if (!contact.birthday) continue;

      const birthdayThisYear = birthdayInYear(contact.birthday, year);
      const oneWeekBefore = addDays(birthdayThisYear, -7);

      const sentTypes = new Set(
        contact.birthdayReminderLogs.map((l) => l.type),
      );

      if (sameUtcDay(today, oneWeekBefore) && !sentTypes.has(BirthdayReminderType.ONE_WEEK_BEFORE)) {
        await this.sendBirthdayEmail(
          contact,
          BirthdayReminderType.ONE_WEEK_BEFORE,
          birthdayThisYear,
          year,
        );
      }

      if (sameUtcDay(today, birthdayThisYear) && !sentTypes.has(BirthdayReminderType.ON_DAY)) {
        await this.sendBirthdayEmail(
          contact,
          BirthdayReminderType.ON_DAY,
          birthdayThisYear,
          year,
        );
      }
    }
  }

  private async sendBirthdayEmail(
    contact: {
      id: string;
      firstName: string;
      lastName: string;
      user: { email: string };
    },
    type: BirthdayReminderType,
    birthdayDate: Date,
    year: number,
  ) {
    const formatted = formatDate(birthdayDate);
    const isWeekBefore = type === BirthdayReminderType.ONE_WEEK_BEFORE;
    const subject = isWeekBefore
      ? `${contact.firstName}'s birthday is in one week`
      : `Today is ${contact.firstName}'s birthday!`;
    const body = isWeekBefore
      ? `${contact.firstName} ${contact.lastName}'s birthday is in one week (${formatted}).`
      : `Today is ${contact.firstName} ${contact.lastName}'s birthday!`;

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
        <h2 style="font-size: 18px; margin-bottom: 16px;">${subject}</h2>
        <p style="font-size: 16px; line-height: 1.6;">${body}</p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">— People Power</p>
      </div>
    `;

    const sent = await this.email.send(contact.user.email, subject, html);
    if (sent) {
      await this.prisma.birthdayReminderLog.create({
        data: { contactId: contact.id, type, year },
      });
      this.logger.log(
        `Sent ${type} birthday reminder for ${contact.firstName} ${contact.lastName}`,
      );
    }
  }
}

/** Feb 29 birthdays fall on Feb 28 in non-leap years. */
function birthdayInYear(birthday: Date, year: number): Date {
  const month = birthday.getUTCMonth();
  const day = birthday.getUTCDate();
  if (month === 1 && day === 29 && !isLeapYear(year)) {
    return new Date(Date.UTC(year, 1, 28));
  }
  return new Date(Date.UTC(year, month, day));
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
