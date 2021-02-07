import { Component, OnInit } from '@angular/core';
import { WalletsService, Account, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.css']
})
export class AccountsComponent implements OnInit {

  constructor(
    private translate: TranslateService,
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
      let msg = marker(`Successfully created new account { address }`);
      const param = { 'address': result.accountAddress };
      this.translate.get(msg, param).subscribe(res => msg = res);
      this.notification.sendSuccess(msg);
    } else if (result.errorCode === WalletErrorCode.MISS) {
      let msg = marker(`Wallet is not configured`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
    } else if (result.errorCode === WalletErrorCode.LOCKED) {
      let msg = marker(`Wallet is locked.`);
      this.translate.get(msg).subscribe(res => msg = res);            
      this.notification.sendError(msg);
    } else {
    }
  }

  changeAccount(address: string) {
    this.wallets.selectAccount(address);
  }

  copied() {
    let msg = marker(`Account address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedWalletIndex(): number {
    return this.wallets.selectedWalletIndex();
  }

  selectedAccount(): string {
    return this.wallets.selectedAccountAddress();
  }
}
