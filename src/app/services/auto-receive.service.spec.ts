import { TestBed } from '@angular/core/testing';

import { AutoReceiveService } from './auto-receive.service';

describe('AutoReceiveService', () => {
  let service: AutoReceiveService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AutoReceiveService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
