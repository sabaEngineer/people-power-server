import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private tagsService: TagsService) {}

  @Get()
  findAll(@Req() req: { user: { id: string } }) {
    return this.tagsService.findAll(req.user.id);
  }

  @Post()
  create(
    @Req() req: { user: { id: string } },
    @Body() dto: CreateTagDto,
  ) {
    return this.tagsService.create(req.user.id, dto);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.tagsService.remove(req.user.id, id);
    return { ok: true };
  }
}
