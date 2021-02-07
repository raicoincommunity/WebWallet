import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { U128 } from '../../services/util.service'
import { NotificationService } from '../../services/notification.service';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-global-settings',
  templateUrl: './global-settings.component.html',
  styleUrls: ['./global-settings.component.css']
})
export class GlobalSettingsComponent implements OnInit {
  autoReceiveEnable: boolean = true;
  autoReceiveMinimum: string = '';
  autoReceiveMinimumAmount: U128 = new U128(0);
  minimumStatus = 0;

  inactivityOptions: { name: string, value: number }[] = [
    { name: 'Never', value: 0 },
    { name: '1 Minute', value: 1 },
    { name: '5 Minutes', value: 5 },
    { name: '15 Minutes', value: 15 },
    { name: '30 Minutes', value: 30 },
    { name: '1 Hour', value: 60 },
    { name: '6 Hours', value: 360 },
  ];
  inactivityMinutes: number = 30;

  constructor(
    private translate: TranslateService,
    private settings: SettingsService,
    private notification: NotificationService) { 
    this.load();
    this.settings.globalSettingChange$.subscribe(() => this.load());
  }

  ngOnInit(): void {
  }

  convertMinimum(): boolean {
    if (!this.autoReceiveMinimum) {
      this.autoReceiveMinimumAmount = new U128(0);
      return false;
    }

    try {
      let minimum = new BigNumber(this.autoReceiveMinimum).mul(U128.RAI().toBigNumber());
      this.autoReceiveMinimumAmount = new U128(minimum);
      return false;
    }
    catch (err) {
      this.autoReceiveMinimumAmount = this.settings.getAutoReceive().minimum;
      return true;
    }
  }

  syncMinimum() {
    if (!this.autoReceiveMinimum) this.minimumStatus = 0;
    this.minimumStatus = this.convertMinimum() ? 2 : 1;
  }

  saveAutoReceive() {
    if (this.convertMinimum()) {
      let msg = marker('Invalid minimum amount');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    this.settings.setAutoReceive({ enable: this.autoReceiveEnable, minimum: this.autoReceiveMinimumAmount });
    let msg = marker(`Successfully updated auto receive setting!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  saveLockMinutes() {
    this.settings.setLockMinutes(this.inactivityMinutes);
    let msg = marker(`Successfully updated auto lock setting!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);    
  }

  toggleAutoReceive() {
    this.autoReceiveEnable = !this.autoReceiveEnable;
  }

  load() {
    this.autoReceiveEnable = this.settings.getAutoReceive().enable;
    this.autoReceiveMinimumAmount = this.settings.getAutoReceive().minimum;
    this.autoReceiveMinimum = this.autoReceiveMinimumAmount.toBalanceStr(U128.RAI());
    this.inactivityMinutes = this.settings.getLockMinutes();
  }
}
