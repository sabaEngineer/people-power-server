import { Global, Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { TagsModule } from '../tags/tags.module';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Global()
@Module({
  imports: [ContactsModule, TagsModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramBotService],
  exports: [TelegramService],
})
export class TelegramModule {}
