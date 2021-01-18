import { TestBed } from '@angular/core/testing';

import { BlocksService } from './blocks.service';

describe('BlocksService', () => {
  let service: BlocksService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BlocksService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
