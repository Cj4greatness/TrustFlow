import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context) as {
      res: { setHeader?: (name: string, value: string | number) => void };
    };
    const retryAfterSeconds = throttlerLimitDetail.timeToBlockExpire;

    if (typeof res.setHeader === 'function') {
      res.setHeader('Retry-After', retryAfterSeconds);
    }

    throw new HttpException(
      {
        message: 'Too many requests. Please try again later.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
