import { Injectable, Logger } from '@nestjs/common';
import { BirthdayReminderType, FactType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

const FACT_TYPE_LABELS: Record<FactType, string> = {
  PAIN: 'Pain / Problem',
  GOAL: 'Goal / Target',
  LIKE: 'Likes',
};

const FACT_TIMING_LABELS: Record<BirthdayReminderType, string> = {
  ON_DAY: 'On this day',
  DAY_BEFORE: 'The day before',
  ONE_WEEK_BEFORE: '1 week before',
  ONE_MONTH_BEFORE: '1 month before',
};

const REMINDER_COPY: Record<
  BirthdayReminderType,
  { subject: (first: string) => string; body: (full: string, date: string) => string }
> = {
  ON_DAY: {
    subject: (first) => `Today is ${first}'s birthday!`,
    body: (full) => `Today is ${full}'s birthday!`,
  },
  DAY_BEFORE: {
    subject: (first) => `${first}'s birthday is tomorrow`,
    body: (full, date) => `${full}'s birthday is tomorrow (${date}).`,
  },
  ONE_WEEK_BEFORE: {
    subject: (first) => `${first}'s birthday is in one week`,
    body: (full, date) => `${full}'s birthday is in one week (${date}).`,
  },
  ONE_MONTH_BEFORE: {
    subject: (first) => `${first}'s birthday is in one month`,
    body: (full, date) => `${full}'s birthday is in one month (${date}).`,
  },
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
        reminderDate: { not: null },
        reminderTimings: { isEmpty: false },
      },
      include: {
        contact: { include: { user: true } },
        reminderLogs: true,
      },
    });

    let sentCount = 0;

    for (const fact of facts) {
      if (!fact.reminderDate) continue;

      const target = startOfUtcDay(fact.reminderDate);
      const selected = new Set(fact.reminderTimings);
      const sentTypes = new Set(fact.reminderLogs.map((l) => l.type));

      const dueDates: { type: BirthdayReminderType; date: Date }[] = [
        { type: BirthdayReminderType.ON_DAY, date: target },
        { type: BirthdayReminderType.DAY_BEFORE, date: addDays(target, -1) },
        { type: BirthdayReminderType.ONE_WEEK_BEFORE, date: addDays(target, -7) },
        {
          type: BirthdayReminderType.ONE_MONTH_BEFORE,
          date: addMonths(target, -1),
        },
      ];

      for (const { type, date } of dueDates) {
        if (!selected.has(type)) continue;
        if (sentTypes.has(type)) continue;
        if (!sameUtcDay(today, date)) continue;

        const sent = await this.sendFactEmail(fact, type, target);
        if (sent) sentCount += 1;
      }
    }

    if (sentCount) {
      this.logger.log(`Sent ${sentCount} fact reminder(s)`);
    }
  }

  private async sendFactEmail(
    fact: {
      id: string;
      type: FactType;
      content: string;
      contact: {
        firstName: string;
        lastName: string;
        user: { email: string };
      };
    },
    timing: BirthdayReminderType,
    reminderDate: Date,
  ): Promise<boolean> {
    const { contact } = fact;
    const label = FACT_TYPE_LABELS[fact.type];
    const when = FACT_TIMING_LABELS[timing];
    const formatted = formatDate(reminderDate);
    const subject = `Reminder: ${contact.firstName} ${contact.lastName}`;
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
        <h2 style="font-size: 18px; margin-bottom: 16px;">Reminder about ${contact.firstName} ${contact.lastName}</h2>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">${label} · ${when}</p>
        <p style="font-size: 13px; color: #9ca3af; margin-bottom: 12px;">Target date: ${formatted}</p>
        <p style="font-size: 16px; line-height: 1.6;">${escapeHtml(fact.content)}</p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">— People Power</p>
      </div>
    `;

    const sent = await this.email.send(contact.user.email, subject, html);
    if (sent) {
      await this.prisma.factReminderLog.create({
        data: { factId: fact.id, type: timing },
      });
    }
    return sent;
  }

  private async sendBirthdayReminders(today: Date) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        birthday: { not: null },
        birthdayReminders: { isEmpty: false },
      },
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
      const selected = new Set(contact.birthdayReminders);
      const sentTypes = new Set(
        contact.birthdayReminderLogs.map((l) => l.type),
      );

      const dueDates: { type: BirthdayReminderType; date: Date }[] = [
        { type: BirthdayReminderType.ON_DAY, date: birthdayThisYear },
        { type: BirthdayReminderType.DAY_BEFORE, date: addDays(birthdayThisYear, -1) },
        { type: BirthdayReminderType.ONE_WEEK_BEFORE, date: addDays(birthdayThisYear, -7) },
        {
          type: BirthdayReminderType.ONE_MONTH_BEFORE,
          date: addMonths(birthdayThisYear, -1),
        },
      ];

      for (const { type, date } of dueDates) {
        if (!selected.has(type)) continue;
        if (sentTypes.has(type)) continue;
        if (!sameUtcDay(today, date)) continue;

        await this.sendBirthdayEmail(contact, type, birthdayThisYear, year);
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
    const full = `${contact.firstName} ${contact.lastName}`;
    const copy = REMINDER_COPY[type];
    const subject = copy.subject(contact.firstName);
    const body = copy.body(full, formatted);

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

/** Subtract calendar months; clamp day if target month is shorter (e.g. Mar 31 → Feb 28). */
function addMonths(d: Date, months: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const result = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
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
