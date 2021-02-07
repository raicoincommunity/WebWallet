import { Component, OnInit } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { Receivable } from '../../services/blocks.service';
import { U256 } from '../../services/util.service';
import { NotificationService } from '../../services/notification.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-receive',
  templateUrl: './receive.component.html',
  styleUrls: ['./receive.component.css']
})
export class ReceiveComponent implements OnInit {
  checkedHashs: string[] = [];
  checkedAll: boolean = false;
  empty: boolean = false;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService, 
    private notification: NotificationService) { }

  ngOnInit(): void {
  }

  receivables(): Receivable[] {
    let result = this.wallets.receivables();
    this.empty = result.length === 0;
    return result;
  }

  receive() {
    if (this.checkedHashs.length === 0) {
      let msg = marker('Please select some items first');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
      return;
    }

    for (let i = 0; i < this.checkedHashs.length; ++i) {
      let result = this.wallets.receive(this.checkedHashs[i]);
      if (result.errorCode !== WalletErrorCode.SUCCESS && result.errorCode !== WalletErrorCode.IGNORED) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
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
    let msg = marker(`Account address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);        
    this.notification.sendSuccess(msg);
  }
}
