import { Component, OnInit, AfterViewInit, Renderer2 } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { BlockTypeStr, U128, U16, U32 } from 'src/app/services/util.service';
import { AliasService } from '../../services/alias.service';
import { ActivatedRoute } from "@angular/router";
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css']
})
export class AccountSettingsComponent implements OnInit, AfterViewInit {
  newRep = '';
  increaseTxns = '';
  txnsStatus = 0;
  increaseCredit = new U16(0);
  newName = '';
  newDns = '';
  newDnsStatus = 0;
  dnsRegexp = /^([a-z0-9-]{1,63}\.)+[a-z]{2,}$/i;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService,
    private route: ActivatedRoute,
    private renderer: Renderer2,
    private alias: AliasService,
    private token: TokenService,
    private notification: NotificationService) { }

  ngOnInit(): void {
    this.alias.addAccount(this.selectedAccountAddress());
  }

  ngAfterViewInit(): void {
    this.route.fragment.subscribe(f => {
      if (!f) return;
      const element = this.renderer.selectRootElement("#" + f, true);
      if (element) element.scrollIntoView({ behavior: 'smooth' });
    });
  }

  changeRep() {
    if (this.locked()) {
      let msg = marker(`Wallet must be unlocked`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendWarning(msg);
      return;
    }

    if (this.newRep.length == 0) {
      let msg = marker(`New representative cannot be empty`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }

    if (this.wallets.validateAddress(this.newRep)) {
      let msg = marker(`Invalid account address`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }

    let accounts = this.wallets.findAccounts(this.newRep);
    if (accounts.length && accounts[0].type.toBlockTypeStr() !== BlockTypeStr.REP_BLOCK) {
      let msg = marker(`Invalid account type`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }

    const error = this.checkToken();
    if (error) return;
    let result = this.wallets.change(this.newRep);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully change representative!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
    this.newRep = '';
  }

  
  changeName() {
    if (this.locked()) {
      let msg = marker(`Wallet must be unlocked`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendWarning(msg);
      return;
    }

    this.newName = this.newName.trim();
    if (this.newName.includes('@')) {
      let msg = marker(`Character '@' is reserved , can't be used in alias`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }

    const error = this.checkToken();
    if (error) return;
    let result = this.wallets.setName(this.newName);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully change alias!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
    this.newName = '';
  }

  changeDns() {
    if (this.locked()) {
      let msg = marker(`Wallet must be unlocked`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
      return;
    }

    this.checkNewDns();
    if (this.newDnsStatus !== 0) {
      let msg = marker(`Invalid domain format`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    const error = this.checkToken();
    if (error) return;
    let result = this.wallets.setDns(this.newDns);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully change domain!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
    this.newDns = '';
  }

  checkNewDns() {
    this.newDns = this.newDns.trim();
    if (this.newDns === '') {
      this.newDnsStatus = 0;
      return;
    }
    this.newDnsStatus = this.dnsRegexp.test(this.newDns) ? 0 : 1;
  }

  currentRep() {
    return this.wallets.representative();
  }

  currentDailyTxns(): number {
    return this.wallets.credit() * 20;
  }

  currentName(): string {
    const address = this.selectedAccountAddress();
    if (!address) return '';
    this.alias.addAccount(address);
    return this.alias.name(address);
  }

  currentDns(): string {
    const address = this.selectedAccountAddress();
    if (!address) return '';
    return this.alias.dns(address);
  }

  checkTxns() {
    if (!this.increaseTxns) this.txnsStatus = 0;
    this.txnsStatus = this.convertTxns() ? 2 : 1;
  }

  convertTxns(): boolean {
    try {
      let txns = new U32(this.increaseTxns);
      if (txns.eq(0) || txns.mod(20).gt(0) || txns.idiv(20).gt(U16.max())) {
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
    return this.wallets.creditCost(this.increaseCredit).toBalanceStr(U128.RAI()) + ' RAI';
  }

  changeCredit() {
    if (this.locked()) {
      let msg = marker(`Wallet must be unlocked`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendWarning(msg);
      return;
    }

    if (this.convertTxns()) {
      let msg = marker('Invalid increasing number');
      this.translate.get(msg).subscribe(res => msg = res);            
      this.notification.sendError(msg);
      return;
    }

    const a = this.wallets.selectedAccount();
    const w = this.wallets.selectedWallet();
    if (!a || !w) return;
    const errorCode = this.token.accountActionCheck(a, w);
    if (errorCode !== WalletErrorCode.SUCCESS
      && errorCode !== WalletErrorCode.CREDIT_RESERVED_FOR_SWAP) {
      let msg = errorCode;
      this.translate.get(msg).subscribe(res => msg = res);    
      this.notification.sendError(`${msg} (${a.shortAddress()})`, { timeout: 20 * 1000 });
      return;
    }

    let result = this.wallets.increaseCredit(this.increaseCredit);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);                  
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully increased daily transactions limit!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
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

  nameCopied() {
    let msg = marker('TXT record name copied to clipboard!');
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  valueCopied() {
    let msg = marker('TXT record value copied to clipboard!');
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  showDnsVerified(): boolean {
    const address = this.selectedAccountAddress();
    if (!address) return false;
    if (!this.alias.verified(address)) return false;
    return this.alias.dnsValid(address);
  }

  showDnsUnverified(): boolean {
    const address = this.selectedAccountAddress();
    if (!address) return false;
    if (!this.alias.verified(address)) return false;
    return !this.alias.dnsValid(address);
  }

  verifyDns() {
    const error = this.alias.verify(this.selectedAccountAddress());
    if (error) return;
    let msg = marker('Account verification request sent!');
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  private checkToken(): boolean {
    const a = this.wallets.selectedAccount();
    const w = this.wallets.selectedWallet();
    if (!a || !w) return true;
    const errorCode = this.token.accountActionCheck(a, w);
    if (errorCode === WalletErrorCode.SUCCESS) return false;

    const address = a.shortAddress();
    let msg = errorCode;
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendError(`${msg} (${address})`, { timeout: 20 * 1000 });

    return true;
  }

}
