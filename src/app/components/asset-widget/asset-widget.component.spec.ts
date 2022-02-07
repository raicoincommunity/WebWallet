import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssetWidgetComponent } from './asset-widget.component';

describe('AssetWidgetComponent', () => {
  let component: AssetWidgetComponent;
  let fixture: ComponentFixture<AssetWidgetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AssetWidgetComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AssetWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
