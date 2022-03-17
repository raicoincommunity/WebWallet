import { TestBed } from '@angular/core/testing';

import { VerifiedTokensService } from './verified-tokens.service';

describe('VerifiedTokensService', () => {
  let service: VerifiedTokensService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VerifiedTokensService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
