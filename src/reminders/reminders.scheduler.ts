import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { RemindersService } from './reminders.service';

/** Fires daily at 8:00 UTC. */
@Injectable()
export class RemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly reminders: RemindersService,
  ) {}

  onModuleInit(): void {
    let job: CronJob;
    try {
      job = new CronJob(
        '0 8 * * *',
        () => {
          void this.reminders.runDailyReminders().catch((err) => {
            this.logger.error(
              `Daily reminders failed: ${(err as Error).message}`,
              (err as Error).stack,
            );
          });
        },
        null,
        false,
        'UTC',
      );
    } catch (err) {
      this.logger.error(`Reminders cron failed to start: ${(err as Error).message}`);
      return;
    }

    this.schedulerRegistry.addCronJob('dailyReminders', job);
    job.start();
    this.logger.log('Reminders scheduler: daily at 08:00 UTC');
  }
}
