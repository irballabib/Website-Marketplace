import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../identity/auth.access';
import type { AuthUser } from '../identity/auth.access';
import {
  CREATE_BOOKING_PERMISSIONS,
  MANAGE_BOOKING_PERMISSIONS,
  VIEW_BOOKING_PERMISSIONS,
} from './booking.constant';
import {
  BookingStatus,
  CreateBookingDto,
  BookingView,
  UpdateBookingStatusDto,
} from './booking.dto';
import { BookingService } from './booking.service';

@Controller('bookings')
@ApiTags('bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @RequirePermissions(CREATE_BOOKING_PERMISSIONS)
  @ApiOperation({ summary: 'Create a new booking' })
  @ApiBody({ type: CreateBookingDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto
  ): Promise<BookingView> {
    return this.bookings.createBooking(user.tenantId, dto, user.id);
  }

  @Get()
  @RequirePermissions(VIEW_BOOKING_PERMISSIONS)
  @ApiOperation({ summary: 'Get all bookings for tenant' })
  @ApiQuery({ name: 'status', enum: Object.values(BookingStatus), required: false })
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: BookingStatus
  ): Promise<BookingView[]> {
    return this.bookings.getBookingsByTenant(user.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions(VIEW_BOOKING_PERMISSIONS)
  @ApiOperation({ summary: 'Get a booking by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async getById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<BookingView> {
    return this.bookings.getBooking(user.tenantId, id);
  }

  @Put(':id/status')
  @RequirePermissions(MANAGE_BOOKING_PERMISSIONS)
  @ApiOperation({ summary: 'Update booking status' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto
  ): Promise<BookingView> {
    return this.bookings.updateBookingStatus(user.tenantId, id, dto.status);
  }
}