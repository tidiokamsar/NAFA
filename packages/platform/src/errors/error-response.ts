import { ApiProperty } from '@nestjs/swagger';

/**
 * The single error shape every NAFA service returns. Clients can rely on these
 * fields being present regardless of which service or which failure produced
 * the response.
 */
export class ErrorResponse {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    description:
      'Stable machine-readable code when the failure came from the domain. ' +
      'Absent for framework-level errors. Branch on this, never on `message`.',
    example: 'BUSINESS_RULE_VIOLATION',
    required: false,
  })
  code?: string;

  @ApiProperty({
    description:
      'Human-readable cause. An array when validation reports several.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'email must be an email',
  })
  message!: string | string[];

  @ApiProperty({ example: '/auth/login' })
  path!: string;

  @ApiProperty({ example: '2026-07-27T10:15:30.000Z' })
  timestamp!: string;

  @ApiProperty({
    description: 'Echoes the x-request-id response header.',
    example: '4f1c1e0a-2b7d-4a1a-9f4a-6f2c9a1b2c3d',
    required: false,
  })
  requestId?: string;

  @ApiProperty({
    description: 'Business transaction id, propagated across services.',
    required: false,
  })
  correlationId?: string;
}
