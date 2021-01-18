import { Component, OnInit } from '@angular/core';
import { WalletsService } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-wallet-settings',
  templateUrl: './wallet-settings.component.html',
  styleUrls: ['./wallet-settings.component.css']
})
export class WalletSettingsComponent implements OnInit {
  newPassword = '';
  confirmPassword = '';

  constructor(
    private wallets: WalletsService,
   private notification: NotificationService) { 
   }

  ngOnInit(): void {
  }

  changePassword() {
    if (this.locked()) {
      this.notification.sendWarning(`Wallet must be unlocked`);
      return;
    }
    
    if (this.newPassword !== this.confirmPassword) {
      this.notification.sendError(`Passwords do not match`);
      return;
    }

    if (this.newPassword.length === 0) {
      this.notification.sendError(`Password cannot be empty`);
      return;
    }

    if (!this.wallets.wallet) {
      this.notification.sendError(`Cann't find the wallet`);
      return;
    }

    this.wallets.setWalletPassword(this.wallets.wallet.storage.id, this.newPassword);

    this.newPassword = '';
    this.confirmPassword = '';
    this.notification.sendSuccess(`Wallet password successfully updated`);
  }

  locked(): boolean {
    if (!this.wallets.wallet) return false;
    return this.wallets.wallet.locked();
  }

  seed(): string {
    return this.wallets.seed();
  }

  seedCopied() {
    this.notification.sendSuccess('Wallet seed copied to clipboard!');
  }

  walletIndex(): number {
    return this.wallets.selectedWalletIndex();
  }

}
