import { Component, OnInit } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-wallet-widget',
  templateUrl: './wallet-widget.component.html',
  styleUrls: ['./wallet-widget.component.css']
})
export class WalletWidgetComponent implements OnInit {
  modal: any = null;
  unlockPassword = '';

  constructor(
    private wallets: WalletsService,
    private notification: NotificationService
  ) { }

  ngOnInit(): void {
    const UIkit = (window as any).UIkit;
    const modal = UIkit.modal(document.getElementById('unlock-wallet-modal'));
    this.modal = modal;
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
      this.notification.sendSuccess(`Wallet locked`);
    }
    else if (result.errorCode === WalletErrorCode.MISS) {
      this.notification.sendError('The wallet has been deleted, please refresh the page.');
    }
    else if (result.errorCode === WalletErrorCode.VULNERABLE) {
      this.notification.sendWarning(`You must set a password on your wallet - it is currently empty!`);
    }
    else {
    }
  }

  unlockWallet() {
    let result = this.wallets.unlock(this.unlockPassword);
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      this.notification.sendSuccess(`Wallet unlocked`);
      this.modal.hide();
    }
    else if (result.errorCode === WalletErrorCode.MISS) {
      this.notification.sendError('The wallet has been deleted, please refresh the page.');
    }
    else if (result.errorCode === WalletErrorCode.INVALID_PASSWORD) {
      this.notification.sendError(`Invalid password, please try again!`);;
    }
    else {
    }

    this.unlockPassword = '';
  }
}
