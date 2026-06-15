import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ConfirmResetDto } from './dto/confirm-reset.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './auth-tokens';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AccessTokenPayload) {
    return user;
  }

  @Public()
  @HttpCode(200)
  @Post('password-reset/request')
  requestReset(@Body() dto: RequestResetDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('password-reset/confirm')
  confirmReset(@Body() dto: ConfirmResetDto) {
    return this.auth.confirmPasswordReset(dto);
  }
}
