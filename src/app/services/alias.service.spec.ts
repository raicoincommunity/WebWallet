import { TestBed } from '@angular/core/testing';

import { AliasService } from './alias.service';

describe('AliasService', () => {
  let service: AliasService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AliasService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
