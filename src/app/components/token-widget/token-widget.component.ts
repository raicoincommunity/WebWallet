import { Component, OnInit, Input, ViewChild, ElementRef, HostListener, Output, EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { WalletsService } from '../../services/wallets.service';
import { LogoService } from '../../services/logo.service';
import { VerifiedTokensService } from '../../services/verified-tokens.service';
import { environment } from '../../../environments/environment';
import { ChainHelper, TokenHelper, TokenTypeStr, U256 } from '../../services/util.service';

@Component({
  selector: 'app-token-widget',
  templateUrl: './token-widget.component.html',
  styleUrls: ['./token-widget.component.css']
})
export class TokenWidgetComponent implements OnInit {
  @Input('raiLabel') label: string = '';

  @Output("raiChange") eventTokenSelected = new EventEmitter<TokenItem | undefined>();

  @ViewChild('tokenDropdown') tokenDropdown! : ElementRef;
  @ViewChild('tokenInput') tokenInput! : ElementRef;
  @ViewChild('tokenSelect') tokenSelect! : ElementRef;

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.tokenInput
       && !this.tokenInput.nativeElement.contains(event.target)
       && !this.tokenSelect.nativeElement.contains(event.target)) {
      this.hideSearchResult();
    }
  }

  tokenInputText: string = '';
  selectedToken: TokenItem | undefined;
  tokenFocused: boolean = false;
  searchResultShown: boolean = false;

  private filtedToken: {chain: string, addressRaw: U256} | undefined;

  constructor(
    private wallets: WalletsService,
    private logo: LogoService,
    private verified: VerifiedTokensService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
  }

  account(): string {
    return this.wallets.selectedAccountAddress();
  }

  clear() {
    this.tokenInputText = '';
    this.selectedToken = undefined;
    this.eventTokenSelected.emit(this.selectedToken);
  }

  filtToken(token: {chain: string, addressRaw: U256} | undefined) {
    this.filtedToken = token;
  }

  onRemove() {
    this.clear();
  }

  onFocus() {
    this.tokenFocused = true;
    this.showSearchResult();
  }

  onBlur() {
    this.tokenFocused = false;
  }

  onChange() {
    if (this.selectedToken && this.selectedToken.textFormat() !== this.tokenInputText) {
      this.selectedToken = undefined;
      this.eventTokenSelected.emit(this.selectedToken);
    }
  }

  showSearchResult() {
    this.searchResultShown = true;
    this.tokenDropdown.nativeElement.classList.add('uk-open');
  }

  hideSearchResult() {
    this.searchResultShown = false;
    this.tokenDropdown.nativeElement.classList.remove('uk-open');
  }

  showLabel(): string {
    let msg = this.label;
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

  selectToken(token: TokenItem) {
    this.selectedToken = token;
    this.tokenInputText = token.textFormat();
    this.hideSearchResult();
    this.eventTokenSelected.emit(this.selectedToken);
  }

  style(): string {
    if (this.selectedToken) {
      return "padding-left: 50px; font-weight: bold;"
    } else {
      return this.tokenInputText ? "font-weight: bold;" : "";
    }
  }

  tokenStatus(): number {
    if (!this.tokenInputText) return 0;
    if (this.filtedToken && this.selectedToken) {
      if (this.filtedToken.chain === this.selectedToken.chain && this.filtedToken.addressRaw.eq(this.selectedToken.addressRaw)) {
        return 2;
      }
    }
    for (let token of this.tokens()) {
      if (this.tokenInputText === token.textFormat()) {
        return 1;
      }
    }
    return 2;
  }

  tokens(): TokenItem[] {
    const result: TokenItem[] = [];
    // todo: add custom tokens
    const custom: TokenItem[] = [];
    for (let i of this.verified.tokens(environment.current_chain)) {
      const chain = ChainHelper.toChainStr(i.chain);
      const existing = custom.find(x => x.chain === chain && x.address == i.address);
      if (existing) continue;
      const item = new TokenItem();
      item.chain = chain;
      item.address = i.address;
      const ret = ChainHelper.addressToRaw(chain, i.address);
      if (ret.error) {
        console.error(`Failed to get raw address, chain=${chain}, address=${i.address}`);
        continue;
      }
      item.addressRaw = ret.raw!;
      item.type = TokenHelper.toTypeStr(i.type);
      if (i.address) {
        item.shortAddress = ChainHelper.toShortAddress(chain, i.address);
      } else {
        item.shortAddress = i.name;
      }
      item.chainLogo = this.logo.getChainLogo(i.chain);
      if (i.address === '') {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, '');
      } else {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, i.address);
      }
      item.symbol = i.symbol;
      item.name = i.name;
      item.decimals = i.decimals;
      result.push(item);
    }

    return result.filter(item => {
      if (this.tokenInputText.includes('<')) return true;
       return item.symbol.toUpperCase().includes(this.tokenInputText.toUpperCase());
      });
  }

  check(): boolean {
    if (!this.selectedToken || this.tokenStatus() !== 1) {
      this.tokenInput.nativeElement.focus();
      return true;
    }

    return false;
  }

}

class TokenItem {
  chain: string = '';
  address: string = '';
  addressRaw: U256 = new U256(0);
  type: string = '';
  shortAddress: string = '';
  chainLogo: string = '';
  tokenLogo: string = '';
  symbol: string = '';
  name: string = '';
  decimals: number = 0;

  textFormat(): string {
    if (this.address) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      return `${this.symbol} <${tokenType}: ${this.shortAddress}>`; 
    } else {
      return `${this.symbol} <${this.shortAddress}>`;
    }
  }

  shortTextFormat(): string {
    if (this.address) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      return `${this.symbol} <${tokenType}>`; 
    } else {
      return `${this.symbol} <${this.shortAddress}>`;
    }
  }

}