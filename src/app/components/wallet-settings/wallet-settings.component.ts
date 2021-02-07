import { Component, OnInit } from '@angular/core';
import { WalletsService } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-wallet-settings',
  templateUrl: './wallet-settings.component.html',
  styleUrls: ['./wallet-settings.component.css']
})
export class WalletSettingsComponent implements OnInit {
  newPassword = '';
  confirmPassword = '';

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService,
    private notification: NotificationService) { 
   }

  ngOnInit(): void {
  }

  changePassword() {
    if (this.locked()) {
      let msg = marker(`Wallet must be unlocked`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
      return;
    }
    
    if (this.newPassword !== this.confirmPassword) {
      let msg = marker(`Passwords do not match`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (this.newPassword.length === 0) {
      let msg = marker(`Password cannot be empty`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (!this.wallets.wallet) {
      let msg = marker(`Cann't find the wallet`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    this.wallets.setWalletPassword(this.wallets.wallet.storage.id, this.newPassword);

    this.newPassword = '';
    this.confirmPassword = '';
    let msg = marker(`Wallet password successfully updated`);
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);
  }

  locked(): boolean {
    if (!this.wallets.wallet) return false;
    return this.wallets.wallet.locked();
  }

  seed(): string {
    return this.wallets.seed();
  }

  seedCopied() {
    let msg = marker('Wallet seed copied to clipboard!');
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);
  }

  walletIndex(): number {
    return this.wallets.selectedWalletIndex();
  }

}
