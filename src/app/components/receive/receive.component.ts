import { Component, OnInit } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { Receivable } from '../../services/blocks.service';
import { U256 } from '../../services/util.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-receive',
  templateUrl: './receive.component.html',
  styleUrls: ['./receive.component.css']
})
export class ReceiveComponent implements OnInit {
  checkedHashs: string[] = [];
  checkedAll: boolean = false;
  empty: boolean = false;

  constructor(private wallets: WalletsService, private notification: NotificationService) { }

  ngOnInit(): void {
  }

  receivables(): Receivable[] {
    let result = this.wallets.receivables();
    this.empty = result.length === 0;
    return result;
  }

  receive() {
    if (this.checkedHashs.length === 0) {
      this.notification.sendWarning('Please select some items first');
      return;
    }

    for (let i = 0; i < this.checkedHashs.length; ++i) {
      let result = this.wallets.receive(this.checkedHashs[i]);
      if (result.errorCode !== WalletErrorCode.SUCCESS && result.errorCode !== WalletErrorCode.IGNORED) {
        this.notification.sendError(result.errorCode);
        return;
      }
    }
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  check(hash: U256) {
    let hashStr = hash.toHex();
    let index = this.checkedHashs.indexOf(hashStr);
    if (index === -1) this.checkedHashs.push(hashStr);
  }

  uncheck(hash: U256) {
    let hashStr = hash.toHex();
    let index = this.checkedHashs.indexOf(hashStr);
    if (index !== -1) this.checkedHashs.splice(index, 1);
  }

  checkAll() {
    this.receivables().forEach(r => this.check(r.hash));
    this.checkedAll = true;
  }

  uncheckAll() {
    this.checkedHashs = [];
    this.checkedAll = false;
  }

  checked(hash: U256): boolean {
    let hashStr = hash.toHex();
    return this.checkedHashs.indexOf(hashStr) !== -1;
  }

  copied() {
    this.notification.sendSuccess(`Account address copied to clipboard!`);
  }
}
