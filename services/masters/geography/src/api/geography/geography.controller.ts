import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '@nafa/platform';
import { FindAreaUseCase, FindCountryUseCase } from '../../application';
import { FindAreasQuery } from './dto/find-areas.query';
import { AreaResponse, CountryResponse } from './dto/area.response';

/**
 * Read access to the administrative-area hierarchy.
 *
 * No error mapper and no authentication, for the reasons ADR-0014 gives:
 * the use cases raise `NafaError`s the platform filter already renders, and
 * administrative divisions are public reference data.
 */
@ApiTags('geography')
@Controller()
export class GeographyController {
  constructor(
    private readonly areas: FindAreaUseCase,
    private readonly countries: FindCountryUseCase,
  ) {}

  @Get('countries')
  @ApiOperation({
    summary: 'The published country templates',
    description:
      'DRAFT profiles are withheld: a template still being written would invite ' +
      'a client to build against levels that may still change.',
  })
  @ApiOkResponse({ type: [CountryResponse] })
  async countriesList(): Promise<CountryResponse[]> {
    const found = await this.countries.listPublished();
    return found.map(CountryResponse.from);
  }

  @Get('countries/:code')
  @ApiOperation({ summary: 'One country template by its ISO code' })
  @ApiParam({ name: 'code', example: 'GN' })
  @ApiOkResponse({ type: CountryResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async country(@Param('code') code: string): Promise<CountryResponse> {
    return CountryResponse.from(await this.countries.byCode(code));
  }

  @Get('areas')
  @ApiOperation({
    summary: 'Search areas within one country, by code or by name',
    description:
      'A code lookup returns one area or 404. A name search returns a list, ' +
      'possibly empty — names repeat across levels, so a match is a signal ' +
      'rather than an answer. With neither, the list is empty: dumping a ' +
      "country's whole hierarchy is not a decision this API has taken.",
  })
  @ApiOkResponse({ type: [AreaResponse] })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async areasList(@Query() query: FindAreasQuery): Promise<AreaResponse[]> {
    if (query.code) {
      const area = await this.areas.byCode(query.country, query.code);
      return [AreaResponse.from(area)];
    }

    if (query.name) {
      const found = await this.areas.byName(query.country, query.name);
      return found.map(AreaResponse.from);
    }

    return [];
  }

  @Get('areas/:id')
  @ApiOperation({ summary: 'One area by its identifier' })
  @ApiOkResponse({ type: AreaResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async area(@Param('id') id: string): Promise<AreaResponse> {
    return AreaResponse.from(await this.areas.byId(id));
  }

  @Get('areas/:id/children')
  @ApiOperation({
    summary: 'The direct children of an area',
    description:
      'One level down, never the whole subtree. A missing parent is a 404 ' +
      'rather than an empty list that would read as "no children".',
  })
  @ApiOkResponse({ type: [AreaResponse] })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async children(@Param('id') id: string): Promise<AreaResponse[]> {
    const found = await this.areas.children(id);
    return found.map(AreaResponse.from);
  }

  @Get('areas/:id/ancestors')
  @ApiOperation({
    summary: 'The chain upward, the area itself excluded',
  })
  @ApiOkResponse({ type: [AreaResponse] })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async ancestors(@Param('id') id: string): Promise<AreaResponse[]> {
    const found = await this.areas.ancestors(id);
    return found.map(AreaResponse.from);
  }
}
