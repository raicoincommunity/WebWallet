import { TestBed } from '@angular/core/testing';

import { BscWeb3Service } from './bsc-web3.service';

describe('BscWeb3Service', () => {
  let service: BscWeb3Service;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BscWeb3Service);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
