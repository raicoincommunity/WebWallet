import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BridgeBscComponent } from './bridge-bsc.component';

describe('BridgeBscComponent', () => {
  let component: BridgeBscComponent;
  let fixture: ComponentFixture<BridgeBscComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ BridgeBscComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BridgeBscComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
