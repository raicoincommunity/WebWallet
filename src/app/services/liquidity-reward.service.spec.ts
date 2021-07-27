import { TestBed } from '@angular/core/testing';

import { LiquidityRewardService } from './liquidity-reward.service';

describe('LiquidityRewardService', () => {
  let service: LiquidityRewardService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LiquidityRewardService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
