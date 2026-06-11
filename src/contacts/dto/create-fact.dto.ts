import { FactType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFactDto {
  @IsEnum(FactType)
  type: FactType;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsDateString()
  reminderDate?: string;
}
