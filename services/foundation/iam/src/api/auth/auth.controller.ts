import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '@nafa/platform';
import { LoginUserUseCase, RegisterUserUseCase } from '../../application';
import { toHttpException } from './auth-error.mapper';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly loginUser: LoginUserUseCase,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account and return an access token' })
  @ApiResponse({
    status: 409,
    description: 'Email already registered',
    type: ErrorResponse,
  })
  register(@Body() dto: RegisterDto) {
    return this.registerUser
      .execute(dto.email, dto.password)
      .catch(toHttpException);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an access token' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ErrorResponse,
  })
  login(@Body() dto: LoginDto) {
    return this.loginUser
      .execute(dto.email, dto.password)
      .catch(toHttpException);
  }
}
