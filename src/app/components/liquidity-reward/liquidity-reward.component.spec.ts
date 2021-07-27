import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiquidityRewardComponent } from './liquidity-reward.component';

describe('LiquidityRewardComponent', () => {
  let component: LiquidityRewardComponent;
  let fixture: ComponentFixture<LiquidityRewardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ LiquidityRewardComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LiquidityRewardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
