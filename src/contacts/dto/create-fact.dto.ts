import { FactType, BirthdayReminderType } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateFactDto {
  @IsEnum(FactType)
  type: FactType;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  reminderDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsEnum(BirthdayReminderType, { each: true })
  reminderTimings?: BirthdayReminderType[];
}
