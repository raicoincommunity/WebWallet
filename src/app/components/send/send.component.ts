import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { Subject} from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { WalletsService, Amount, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { U256, U128, UtilService } from '../../services/util.service';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { AliasService } from '../../services/alias.service';
import { AssetWidgetComponent } from '../asset-widget/asset-widget.component';
import { ExtensionTokenOpStr, TokenTypeStr, ExtensionTypeStr } from '../../services/util.service';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-send',
  templateUrl: './send.component.html',
  styleUrls: ['./send.component.css']
})
export class SendComponent implements OnInit {
  activePanel = 'send';
  destination = '';
  note = '';
  searchResult: string[] = []
  searchedName: string = '';
  searchedDns: string = '';
  searchResultShown: boolean = false;
  destinationFocused: boolean = false;

  destinationAccount = '';
  destinationSubAccount = '';
  destinationAlias = '';
  destinationName = '';
  destinationDns = '';

  private destinationSubject = new Subject<string>();
  private accountRegex = /^rai_[13456789abcdefghijkmnopqrstuwxyz]{60}$/;
  private subAccountRegex = /^(rai_[13456789abcdefghijkmnopqrstuwxyz]{60})_(.+)$/u;
  private aliasRegex = /^(.+)<(rai_[13456789abcdefghijkmnopqrstuwxyz]{60})>$/u;
  private subAliasRegex = /^(.+)<(rai_[13456789abcdefghijkmnopqrstuwxyz]{60})>_(.+)$/u;
  private dnsRegexp = /^[a-z0-9][a-z0-9-\.]{0,252}$/i;

  @ViewChild('destinationDropdown') destinationDropdown! : ElementRef;
  @ViewChild('destinationInput') destinationInput! : ElementRef;
  @ViewChild(AssetWidgetComponent) assetWidget! : AssetWidgetComponent;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService,
    private token: TokenService,
    private notification: NotificationService,
    private alias: AliasService,
    private util: UtilService,
    private router: Router) {
      this.alias.searchResult$.subscribe(result => {
        this.searchResult = [];
        this.searchResult = result.accounts;
        this.searchedName = result.name;
        this.searchedDns = result.dns;
        this.showSearchResult();
      });

      this.alias.addAccount(this.selectedAccountAddress());
     }

  ngOnInit(): void {
    this.destinationSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe(
      _ => {
        this.hideSearchResult();
        this.search();
      }
    );

  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.destinationInput
       && !this.destinationInput.nativeElement.contains(event.target)) {
      this.hideSearchResult();
    }
  }

  balance(): Amount {
    return this.wallets.balance();
  }
  
  confirm() {
    if (this.assetWidget.check()) {
      this.activePanel = 'send';
      return;
    }

    const widget = this.assetWidget;
    const asset = widget.selectedAsset;
    if (!asset) return;
    if (asset.isRaicoin) {
      const a = this.wallets.selectedAccount();
      const w = this.wallets.selectedWallet();
      if (!a || !w) return;
      const errorCode = this.token.accountActionCheck(a, w);
      if (errorCode !== WalletErrorCode.SUCCESS) {
        let msg = errorCode;
        this.translate.get(msg).subscribe(res => msg = res);    
        this.notification.sendError(`${msg} (${a.shortAddress()})`, { timeout: 20 * 1000 });
        return;
      }

      const amount = new U128(widget.amount.toDec(), 10, true);
      const result = this.wallets.send(this.destinationAccount, amount,
                                       this.note, this.destinationSubAccount);
      if (result.errorCode !== WalletErrorCode.SUCCESS) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
      let msg = marker(`Successfully sent { amount } RAI!`);
      const param = { 'amount': amount.toBalanceStr(U128.RAI()) };
      this.translate.get(msg, param).subscribe(res => msg = res);    
      this.notification.sendSuccess(msg);
      
    } else {
      let value: any = {
        op: ExtensionTokenOpStr.SEND,
        chain: asset.chain,
        type: asset.type,
        address_raw: asset.addressRaw.toHex(),
        to: this.destinationAccount,
      };
      if (asset.type === TokenTypeStr._20) {
        value.value = widget.amount.toDec();
      } else if (asset.type === TokenTypeStr._721) {
        value.value = widget.tokenId.toDec();
      } else {
        console.log(`confirmSend:Unknown type=${asset.type}`);
        return;
      }
      const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];

      if (this.note) {
        const extension = { type: ExtensionTypeStr.NOTE, value: this.note };
        extensions.push(extension);
      }

      if (this.destinationSubAccount) {
        const extension = { type: ExtensionTypeStr.SUB_ACCOUNT, value: this.destinationSubAccount }
        extensions.push(extension);
      }
  
      const result = this.token.change(this.selectedAccountAddress(), extensions);
      if (result.errorCode !== WalletErrorCode.SUCCESS) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
  
      let msg = marker(`Successfully sent { amount }!`);
      const param = { 'amount': this.showAmount() };
      this.translate.get(msg, param).subscribe(res => msg = res);    
      this.notification.sendSuccess(msg);
    }

    this.activePanel = 'send';
    this.destination = '';
    this.note = '';
    this.assetWidget.clear();
    this.router.navigate([`/account/${this.selectedAccountAddress()}`]);
  }

  send() {
    
    if (this.destinationStatus() !== 1) {
      if (!this.destination) {
        this.destinationInput.nativeElement.focus()
      }
      return;
    }
    if (this.assetWidget.check()) return;

    if (this.destinationDns && !this.alias.dnsValid(this.destinationAccount)) {
      let msg = marker('Destination account unverified');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
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
        this.wallets.tryInputPassword(() => { this.activePanel = 'confirm'; });
        return;
      }
    }

    this.activePanel = 'confirm';
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  sourceAlias(): string {
    return this.alias.alias(this.selectedAccountAddress());
  }

  destinationStatus(): number {
    if (this.destination !== this.makeDestination()) {
      return 2;
    }

    if (!this.destination) {
      return 0;
    }

    if (this.destinationName || this.destinationDns) {
      if (this.destinationName !== this.alias.name(this.destinationAccount)) {
        return 2;
      }
      if (this.destinationDns !== this.alias.dns(this.destinationAccount)) {
        return 2;
      }
    }

    if (this.destinationDns) {
      if (!this.alias.verified(this.destinationAccount)) {
        return 0;
      }
      if (!this.alias.dnsValid(this.destinationAccount)) {
        return 2;
      }
    }

    let account = new U256();
    if (account.fromAccountAddress(this.destinationAccount)) {
      return 2;
    }

    if (this.assetWidget && !this.assetWidget.checkAsset()) {
      if (!this.assetWidget.transferable(this.selectedAccountAddress(), this.destinationAccount)) {
        return 2;
      }
    }

    return 1;
  }

  destinationFocus() {
    this.destinationFocused = true;
    this.showSearchResult();
  }

  destinationBlur() {
    this.destinationFocused = false;
  }

  showSearchResult() {
    if (this.searchResult.length === 0) return;
    if (this.searchedName !== this.destinationName
      || this.searchedDns !== this.destinationDns) return;
    this.destinationDropdown.nativeElement.classList.add('uk-open');
    this.searchResultShown = true;
  }

  hideSearchResult() {
    this.destinationDropdown.nativeElement.classList.remove('uk-open');
    this.searchResultShown = false;
  }

  search() {
    this.syncDestination();
    if (this.destinationAccount) {
      this.alias.addAccount(this.destinationAccount);
      return;
    }

    if (!this.destinationName && !this.destinationDns) return;
    if (this.destinationName === this.searchedName
      && this.destinationDns === this.searchedDns) {
      this.showSearchResult();
      return;
    }
    this.alias.search(this.destinationName, this.destinationDns);
  }

  select(account: string) {
    if (!this.searchEntryValid(account)) return;
    this.destination = this.makeDestination(account);
    this.syncDestination();
    this.searchResult = [];
    this.searchedName = '';
    this.searchedDns = '';
  }

  showSearchEntry(account: string): string {
    return this.makeDestination(account, true, false);
  }

  selectedDnsValid(account: string = ''): boolean {
    if (!account) {
      account = this.destinationAccount;
    }
    if (!account) return false;
    if (!this.destinationDns) return false;
    if (!this.alias.verified(account)) return false;
    if (this.alias.dns(account) != this.destinationDns) return false;
    return this.alias.dnsValid(account);
  }

  dnsValid(account: string): boolean {
    if (!this.alias.dns(account)) return false;
    if (!this.alias.verified(account)) return false;
    return this.alias.dnsValid(account);
  }

  dnsInvalid(account: string): boolean {
    if (!this.alias.dns(account)) return false;
    if (!this.alias.verified(account)) return false;
    return !this.alias.dnsValid(account);
  }

  dnsUnverified(account: string): boolean {
    if (!this.alias.dns(account)) return false;
    return !this.alias.verified(account);
  }

  destinationChanged() {
    this.destination = this.destination.trim();
    this.destinationSubject.next(this.destination);
    this.showSearchResult();
  }

  searchEntryValid(account: string): boolean {
    if (!this.alias.dns(account)) return true;
    if (!this.alias.verified(account)) return false;
    return this.alias.dnsValid(account);
  }

  showAmount(): string {
    return this.assetWidget.showAmount();
  }

  showBalance(): string {
    return this.assetWidget.showBalance();
  }

  private syncDestination() {
    this.destinationAccount = '';
    this.destinationSubAccount = '';
    this.destinationAlias = '';
    this.destinationName = '';
    this.destinationDns = '';

    let match = this.destination.match(this.accountRegex);
    if (match) {
      this.destinationAccount = match[0];
      return;
    }

    match = this.destination.match(this.subAccountRegex);
    if (match) {
      this.destinationAccount = match[1];
      this.destinationSubAccount = match[2];
      return;
    }

    match = this.destination.match(this.aliasRegex);
    if (match) {
      this.destinationAlias = match[1];
      this.destinationAccount = match[2];
      this.syncAlias();
      return;
    }

    match = this.destination.match(this.subAliasRegex);
    if (match) {
      this.destinationAlias = match[1];
      this.destinationAccount = match[2];
      this.destinationSubAccount = match[3];
      this.syncAlias();
      return;
    }

    this.destinationAlias = this.destination;
    this.syncAlias();
  }

  private syncAlias() {
    this.destinationName = '';
    this.destinationDns = '';
    if (!this.destinationAlias) return;

    const arr = this.destinationAlias.split('@');
    if (arr.length === 1) {
      this.destinationName = arr[0];
    } else if (arr.length === 2) {
      const index = arr[1].indexOf('_');
      if (index === -1) {
        if (this.dnsRegexp.test(arr[1])) {
          this.destinationName = arr[0];
          this.destinationDns = arr[1];  
        }
      } else {
        if (this.destinationSubAccount) return;
        const dns = arr[1].substr(0, index);
        if (this.dnsRegexp.test(dns)) {
          this.destinationName = arr[0];
          this.destinationDns = dns;
          this.destinationAlias = `${arr[0]}@${dns}`;
          this.destinationSubAccount = arr[1].substr(index + 1);
        }
      }
    }
  }

  private makeDestination(account: string = '', short: boolean = false, sub: boolean = true): string {
    let name = '';
    let dns = '';
    if (account) {
      name = this.alias.name(account);
      dns = this.alias.dns(account);
    } else {
      account = this.destinationAccount;
      name = this.destinationName;
      dns = this.destinationDns;
    }

    if (!account) {
      return '';
    }

    if (short) {
      account = this.util.other.shortAddress(account);
    }

    let result = '';
    if (dns && name) {
      result = `${name}@${dns}<${account}>`;
    } else if (!dns && name) {
      result = `${name}<${account}>`;
    } else if (dns && !name) {
      result = `@${dns}<${account}>`;
    } else {
      result = account;
    }

    if (this.destinationSubAccount && sub) {
      result = `${result}_${this.destinationSubAccount}`;
    }
    return result;
  }

}
