import { Component, OnInit } from '@angular/core';
import { WalletsService, Amount, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { U256, U128 } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { Router } from '@angular/router';

@Component({
  selector: 'app-send',
  templateUrl: './send.component.html',
  styleUrls: ['./send.component.css']
})
export class SendComponent implements OnInit {
  activePanel = 'send';
  destinationStatus = 0;
  amountStatus = 0;
  destination = '';
  amount = new U128(0);
  amountInRai = '';
  note = '';

  constructor(
    private wallets: WalletsService,
    private notification: NotificationService,
    private router: Router) { }

  ngOnInit(): void {
  }

  balance(): Amount {
    return this.wallets.balance();
  }
  
  confirm() {
    let result = this.wallets.send(this.destination, this.amount, this.note);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      this.notification.sendError(result.errorCode);
      return;
    }
    this.notification.sendSuccess(`Successfully sent ${this.amountInRai} RAI!`);
    this.activePanel = 'send';
    this.destinationStatus = 0;
    this.amountStatus = 0;
    this.destination = '';
    this.amount = new U128(0);
    this.amountInRai = '';
    this.router.navigate([`/account/${this.selectedAccountAddress()}`]);

  }

  send() {
    this.syncAmount();
    if (!this.amount || this.amount.eq(0)) {
      this.amountStatus = 2;
    }

    let account = new U256();
    this.destinationStatus = account.fromAccountAddress(this.destination) ? 2 : 1;

    if (this.amountStatus === 2 || this.destinationStatus === 2) {
      return;
    }

    if (this.balance().value.lt(this.amount)) {
      this.notification.sendError('Not enough balance');
      return;
    }

    let errorCode = this.wallets.accountActionCheck(this.wallets.selectedAccount(),
                                                    this.wallets.selectedWallet());
    if (errorCode !== WalletErrorCode.SUCCESS) {
      this.notification.sendError(errorCode);
      return;
    }

    this.activePanel = 'confirm';
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  setMaxAmount() {
    let amount = this.wallets.balance();
    this.amount = amount.value;
    this.amountInRai = this.amount.toBalanceStr(U128.RAI());
  }

  syncAmount() {
    try {
      if (!this.amountInRai) {
        this.amountStatus = 2;
        return;
      }
      let amount = new BigNumber(this.amountInRai).mul(U128.RAI().toBigNumber());
      this.amount = new U128(amount);
      if (this.amount.eq(0)) {
        this.amountStatus = 2;
        return;
      }
      this.amountStatus = 1;
    }
    catch (err) {
      this.amountStatus = 2;
    }
  }

  validateDestination() {
    let account = new U256();
    this.destinationStatus = account.fromAccountAddress(this.destination) ? 2 : 1;
  }

}
