import { TestBed } from '@angular/core/testing';

import { AutoSwapService } from './auto-swap.service';

describe('AutoSwapService', () => {
  let service: AutoSwapService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AutoSwapService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
