import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Get('me/devices')
  listDevices(@CurrentUser() user: JwtPayload) {
    return this.usersService.listDevices(user.sub);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me/devices/:id')
  async revokeDevice(@CurrentUser() user: JwtPayload, @Param('id') deviceId: string) {
    await this.usersService.revokeDevice(user.sub, deviceId);
  }
}
