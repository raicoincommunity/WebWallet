import { TestBed } from '@angular/core/testing';

import { BscBridgeService } from './bsc-bridge.service';

describe('BscBridgeService', () => {
  let service: BscBridgeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BscBridgeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
