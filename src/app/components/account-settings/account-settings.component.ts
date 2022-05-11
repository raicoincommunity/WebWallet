import { Component, OnInit, AfterViewInit, Renderer2 } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { BlockTypeStr, U128, U16, U32 } from 'src/app/services/util.service';
import { AliasService } from '../../services/alias.service';
import { ActivatedRoute } from "@angular/router";
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenService } from '../../services/token.service';
import { ServerService } from '../../services/server.service';

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css']
})
export class AccountSettingsComponent implements OnInit, AfterViewInit {
  newRep = '';
  inputIncreaseCredit = '';
  creditStatus = 0;
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
    private server: ServerService,
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

  credit(): number {
    return this.wallets.credit();
  }

  currentDailyTxns(): string {
    const headTimestamp = this.wallets.headTimestamp();
    if (headTimestamp === 0) return '';
    const counter = this.wallets.headCounter();
    const now = this.server.getTimestamp();
    const credit = this.wallets.credit();
    const total = credit * 20;
    if (headTimestamp - (headTimestamp % 86400) === now - (now % 86400)) {
      return `${counter} / ${total}`;
    }
    else {
      return `0 / ${total}`;
    }
  }

  orders(): string {
    const credit = this.wallets.credit();
    if (credit === 0) return '';
    const orders = this.token.activeOrders();
    if (!orders) return '';
    return `${orders.toDec()} / ${credit}`;
  }

  swaps(): string {
    const credit = this.wallets.credit();
    if (credit === 0) return '';
    const swaps = this.token.activeSwaps();
    if (!swaps) return '';
    return `${swaps.toDec()} / ${credit}`;
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

  checkCredit() {
    if (!this.inputIncreaseCredit) {
      this.creditStatus = 0;
      return;
    }
    
    try {
      this.increaseCredit = new U16(this.inputIncreaseCredit);
      if (this.wallets.creditCost(this.increaseCredit).gt(this.wallets.balance().value)) {
        this.creditStatus = 2;
        return;
      }

      const max = U16.max().minus(this.wallets.credit());
      if (this.increaseCredit.gt(max)) {
        this.creditStatus = 2;
        return;
      }
      this.creditStatus = 1;
    } catch (err) {
      this.creditStatus = 2;
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

    this.checkCredit();
    if (this.creditStatus !== 1) {
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

    let msg = marker(`Successfully increased account credit!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
    this.inputIncreaseCredit = '';
    this.creditStatus = 0;
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
