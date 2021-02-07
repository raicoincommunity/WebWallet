import { Component, OnInit } from '@angular/core';
import { WalletsService, Amount, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { U256, U128 } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

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
    private translate: TranslateService,
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
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    let msg = marker(`Successfully sent { amount } RAI!`);
    const param = { 'amount': this.amountInRai };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);

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
      let msg = marker('Not enough balance');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let errorCode = this.wallets.accountActionCheck(this.wallets.selectedAccount(),
                                                    this.wallets.selectedWallet());
    if (errorCode !== WalletErrorCode.SUCCESS) {
      let msg = errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
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
