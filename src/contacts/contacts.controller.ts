import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateFactDto } from './dto/create-fact.dto';
import { UpdateFactDto } from './dto/update-fact.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Get()
  findAll(
    @Req() req: { user: { id: string } },
    @Query('q') q?: string,
    @Query('tags') tags?: string,
  ) {
    return this.contactsService.findAll(req.user.id, q, tags);
  }

  @Post()
  create(
    @Req() req: { user: { id: string } },
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.create(req.user.id, dto);
  }

  @Get(':id')
  findOne(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.contactsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.contactsService.remove(req.user.id, id);
    return { ok: true };
  }

  @Post(':id/facts')
  addFact(
    @Req() req: { user: { id: string } },
    @Param('id') contactId: string,
    @Body() dto: CreateFactDto,
  ) {
    return this.contactsService.addFact(req.user.id, contactId, dto);
  }

  @Patch(':id/facts/:factId')
  updateFact(
    @Req() req: { user: { id: string } },
    @Param('id') contactId: string,
    @Param('factId') factId: string,
    @Body() dto: UpdateFactDto,
  ) {
    return this.contactsService.updateFact(req.user.id, contactId, factId, dto);
  }

  @Delete(':id/facts/:factId')
  async removeFact(
    @Req() req: { user: { id: string } },
    @Param('id') contactId: string,
    @Param('factId') factId: string,
  ) {
    await this.contactsService.removeFact(req.user.id, contactId, factId);
    return { ok: true };
  }
}
