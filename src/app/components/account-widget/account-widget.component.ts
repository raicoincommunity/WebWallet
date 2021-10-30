import { Component, OnInit, Input } from '@angular/core';
import { WalletsService } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { AliasService } from '../../services/alias.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-account-widget',
  templateUrl: './account-widget.component.html',
  styleUrls: ['./account-widget.component.css']
})
export class AccountWidgetComponent implements OnInit {
  @Input('raiTitle')
  title: string = '';

  @Input('raiCopyable')
  copyable: boolean = true;

  @Input('raiChangable')
  changable: boolean = true;

  addressToggle: boolean = true;

  constructor(
    private wallets: WalletsService,
    private notification: NotificationService,
    private alias: AliasService,
    private translate: TranslateService
    ) { }

  ngOnInit(): void {
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  copied() {
    if (this.showAlias()) {
      let msg = marker('Account alias copied to clipboard!');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendSuccess(msg);  
    } else {
      let msg = marker('Account address copied to clipboard!');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendSuccess(msg);  
    }
  }

  hasAlias(): boolean {
    return !!this.alias.alias(this.wallets.selectedAccountAddress());
  }

  showAlias(): boolean {
    if (!this.hasAlias()) return false;
    return this.addressToggle;
  }

  toggleAddress() {
    this.addressToggle = !this.addressToggle;
  }

  getAlias(): string {
    return this.alias.alias(this.wallets.selectedAccountAddress());
  }

  copyAccountOrAlias(): string {
    if (this.showAlias()) {
      return this.getAlias();
    } else {
      return this.selectedAccountAddress();
    }
  }

}
