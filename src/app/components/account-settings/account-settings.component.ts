import { Component, OnInit } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { BlockTypeStr, U128, U16, U32 } from 'src/app/services/util.service';

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css']
})
export class AccountSettingsComponent implements OnInit {
  newRep = '';
  increaseTxns = '';
  txnsStatus = 0;
  increaseCredit = new U16(0);

  constructor(
    private wallets: WalletsService,
    private notification: NotificationService) { }

  ngOnInit(): void {
  }

  changeRep() {
    if (this.locked()) {
      this.notification.sendWarning(`Wallet must be unlocked`);
      return;
    }

    if (this.newRep.length == 0) {
      this.notification.sendError(`New representative cannot be empty`);
      return;
    }

    if (this.wallets.validateAddress(this.newRep)) {
      this.notification.sendError(`Invalid account address`);
      return;
    }

    let accounts = this.wallets.findAccounts(this.newRep);
    if (accounts.length && accounts[0].type.toBlockTypeStr() !== BlockTypeStr.REP_BLOCK) {
      this.notification.sendError(`Invalid account type`);
      return;
    }

    let result = this.wallets.change(this.newRep);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      this.notification.sendError(result.errorCode);
      return;
    }
    this.notification.sendSuccess(`Successfully change representative!`);
    this.newRep = '';
  }

  currentRep() {
    return this.wallets.representative();
  }

  currentDailyTxns(): number {
    return this.wallets.credit() * 20;
  }

  checkTxns() {
    if (!this.increaseTxns) this.txnsStatus = 0;
    this.txnsStatus = this.convertTxns() ? 2 : 1;
  }

  convertTxns(): boolean {
    try {
      let txns = new U32(this.increaseTxns);
      if (txns.eq(0) || txns.mod(20).gt(0) || txns.idiv(20).gt(U16.MAX)) {
        this.increaseCredit = new U16(0);
        return true;
      }

      this.increaseCredit = new U16(txns.idiv(20).toBigNumber());
      return false;
    }
    catch (err) {
      this.increaseCredit = new U16(0);
      return true;
    }
  }

  cost(): string {
    if (this.increaseCredit.eq(0)) return '';
    return this.wallets.creditCost(this.increaseCredit).toBalanceStr(U128.RAI) + ' RAI';
  }

  changeCredit() {
    if (this.locked()) {
      this.notification.sendWarning(`Wallet must be unlocked`);
      return;
    }

    if (this.convertTxns()) {
      this.notification.sendError('Invalid transactions');
      return;
    }

    let result = this.wallets.increaseCredit(this.increaseCredit);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      this.notification.sendError(result.errorCode);
      return;
    }
    this.notification.sendSuccess(`Successfully increased daily transactions limit!`);
    this.increaseTxns = '';
    this.txnsStatus = 0;
    this.increaseCredit = new U16(0);
  }

  locked(): boolean {
    if (!this.wallets.wallet) return false;
    return this.wallets.wallet.locked();
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  changable(): boolean {
    let account = this.wallets.selectedAccount();
    if (!account) return false;
    if (!account.created()) return false;
    return true;
  }

  synced(): boolean {
    let account = this.wallets.selectedAccount();
    if (!account) return false;
    return account.synced;
  }

}
