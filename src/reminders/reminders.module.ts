import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersScheduler } from './reminders.scheduler';

@Module({
  providers: [RemindersService, RemindersScheduler],
})
export class RemindersModule {}
