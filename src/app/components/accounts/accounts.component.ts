import { Component, OnInit } from '@angular/core';
import { WalletsService, Account, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.css']
})
export class AccountsComponent implements OnInit {

  constructor(
    private wallets: WalletsService,
    private notification: NotificationService) {

   }

  ngOnInit(): void {
  }

  accounts(): Account[] {
    if (!this.wallets.wallet) return [];
    return this.wallets.wallet.accounts;
  }

  addNewAccount() {
    let result = this.wallets.createAccount();
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      console.log(result);
      this.notification.sendSuccess(`Successfully created new account ${result.accountAddress}`);
    } else if (result.errorCode === WalletErrorCode.MISS) {
      this.notification.sendError(`Wallet is not configured`);
    } else if (result.errorCode === WalletErrorCode.LOCKED) {
      this.notification.sendError(`Wallet is locked.`);
    } else {
    }
  }

  changeAccount(address: string) {
    this.wallets.selectAccount(address);
  }

  copied() {
    this.notification.sendSuccess(`Account address copied to clipboard!`);
  }

  selectedWalletIndex(): number {
    return this.wallets.selectedWalletIndex();
  }

  selectedAccount(): string {
    return this.wallets.selectedAccountAddress();
  }
}
