import { IsString, MinLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  name: string;
}
