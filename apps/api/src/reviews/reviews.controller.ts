import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

@Controller('products/:id/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  list(@Param('id') productId: string, @Query() query: ListReviewsDto) {
    return this.reviews.listPublic(productId, query);
  }

  // Any authenticated customer; the delivered-gate is enforced in the service.
  @Post()
  create(
    @Param('id') productId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(productId, user.sub, dto);
  }
}
