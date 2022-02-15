import { Component, OnInit } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-wallet-widget',
  templateUrl: './wallet-widget.component.html',
  styleUrls: ['./wallet-widget.component.css']
})
export class WalletWidgetComponent implements OnInit {
  modal: any = null;
  unlockPassword = '';

  private callback: any = null;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService,
    private notification: NotificationService
  ) { }

  ngOnInit(): void {
    const UIkit = (window as any).UIkit;
    const modal = UIkit.modal(document.getElementById('unlock-wallet-modal'));
    this.modal = modal;

    this.wallets.showModal$.subscribe(x => {
      if (!this.modal) return;
      this.modal.show();
      if (x) this.callback = x;
    });
  }

  configured(): boolean {
     return this.wallets.configured();
  }

  locked(): boolean {
    if (!this.wallets.wallet) return false;
    return this.wallets.wallet.locked();
  }

  lockWallet() {
    let result = this.wallets.lock();
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      let msg = marker(`Wallet locked`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendSuccess(msg);
    }
    else if (result.errorCode === WalletErrorCode.MISS) {
      let msg = marker('The wallet has been deleted, please refresh the page.');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
    }
    else if (result.errorCode === WalletErrorCode.VULNERABLE) {
      let msg = marker(`You must set a password on your wallet - it is currently empty!`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
    }
    else {
    }
  }

  unlockWallet() {
    let result = this.wallets.unlock(this.unlockPassword);
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      let msg = marker(`Wallet unlocked`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendSuccess(msg);
      this.modal.hide();
      if (this.callback) {
        this.callback();
        this.callback = null;
      }
    }
    else if (result.errorCode === WalletErrorCode.MISS) {
      let msg = marker('The wallet has been deleted, please refresh the page.');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
    }
    else if (result.errorCode === WalletErrorCode.INVALID_PASSWORD) {
      let msg = marker(`Invalid password, please try again!`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);;
    }
    else {
    }

    this.unlockPassword = '';
  }

  cancel() {
    this.callback = null;
  }

}
