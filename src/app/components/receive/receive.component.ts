import { Component, OnInit } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { Receivable } from '../../services/blocks.service';
import { U256 } from '../../services/util.service';
import { NotificationService } from '../../services/notification.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenService, TokenReceivable } from '../../services/token.service';

@Component({
  selector: 'app-receive',
  templateUrl: './receive.component.html',
  styleUrls: ['./receive.component.css']
})
export class ReceiveComponent implements OnInit {
  checkedHashs: string[] = [];
  checkedKeys: string[] = [];
  checkedAll: boolean = false;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService, 
    private token: TokenService,
    private notification: NotificationService) { }

  ngOnInit(): void {
  }

  receivables(): Receivable[] {
    return this.wallets.receivables();
  }

  tokenReceivables(): TokenReceivable[] {
    return this.token.receivables();
  }

  receive() {
    if (this.checkedHashs.length === 0 && this.checkedKeys.length === 0) {
      let msg = marker('Please select some items first');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
      return;
    }

    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword(() => { this.doReceive() });
        return;
      }
    }

    this.doReceive();
  }

  doReceive() {
    let error = false;
    let received = false;
    for (let hash of this.checkedHashs) {
      const result = this.wallets.receive(hash);
      if (result.errorCode !== WalletErrorCode.SUCCESS && result.errorCode !== WalletErrorCode.IGNORED) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        error = true;
        break;
      }
      received = true;
    }
    if (received) {
      const account = this.wallets.selectedAccount();
      if (account) {
        this.wallets.receivablesQuery(account);
      }
    }

    if (error) return;
    received = false;
    for (let key of this.checkedKeys) {
      const result = this.token.receive(this.selectedAccountAddress(), key);
      if (result.errorCode !== WalletErrorCode.SUCCESS && result.errorCode !== WalletErrorCode.IGNORED) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        break;
      }
      received = true;
    }
    if (received) {
      this.token.receivablesQuery(this.selectedAccountAddress());
    }
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  check(hash: U256) {
    const hashStr = hash.toHex();
    const index = this.checkedHashs.indexOf(hashStr);
    if (index === -1) this.checkedHashs.push(hashStr);
  }

  tokenCheck(key: string) {
    const index = this.checkedKeys.indexOf(key);
    if (index === -1) this.checkedKeys.push(key);
  }

  uncheck(hash: U256) {
    const hashStr = hash.toHex();
    const index = this.checkedHashs.indexOf(hashStr);
    if (index !== -1) this.checkedHashs.splice(index, 1);
  }

  tokenUncheck(key: string) {
    const index = this.checkedKeys.indexOf(key);
    if (index !== -1) this.checkedKeys.splice(index, 1);
  }

  checkAll() {
    this.receivables().forEach(r => this.check(r.hash));
    this.tokenReceivables().forEach(r => this.tokenCheck(r.key()));
    this.checkedAll = true;
  }

  uncheckAll() {
    this.checkedHashs = [];
    this.checkedKeys = [];
    this.checkedAll = false;
  }

  checked(hash: U256): boolean {
    let hashStr = hash.toHex();
    return this.checkedHashs.indexOf(hashStr) !== -1;
  }

  tokenChecked(key: string): boolean {
    return this.checkedKeys.indexOf(key) !== -1;
  }

  copied() {
    let msg = marker(`Account address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);        
    this.notification.sendSuccess(msg);
  }

  empty(): boolean {
    return this.wallets.receivables().length === 0 && this.token.receivables().length === 0;
  }

}
