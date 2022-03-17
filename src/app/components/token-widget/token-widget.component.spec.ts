import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TokenWidgetComponent } from './token-widget.component';

describe('TokenWidgetComponent', () => {
  let component: TokenWidgetComponent;
  let fixture: ComponentFixture<TokenWidgetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TokenWidgetComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TokenWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
