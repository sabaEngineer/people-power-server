import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BirthdayReminderType } from '@prisma/client';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  birthday?: string | null;

  @IsOptional()
  @IsArray()
  @IsEnum(BirthdayReminderType, { each: true })
  birthdayReminders?: BirthdayReminderType[];

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  socialUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
