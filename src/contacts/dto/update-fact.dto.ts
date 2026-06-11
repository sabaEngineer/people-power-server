import { PartialType } from '@nestjs/mapped-types';
import { CreateFactDto } from './create-fact.dto';

export class UpdateFactDto extends PartialType(CreateFactDto) {}
